import { StorageDriver, DestinationConfig, BackupManifest, BackupChunkMeta } from "../types";

const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart'
const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3'

export class GoogleDriveDriver implements StorageDriver {
	private accessToken: string | null = null
	private parentFolderId: string | undefined

	async init(destination: DestinationConfig) {
		const config = destination.config as Record<string, string>

		if (destination.oauth2Tokens?.access_token) {
			this.accessToken = destination.oauth2Tokens.access_token
		} else {
			this.accessToken = config.accessToken
		}

		this.parentFolderId = config.folderId

		// Similar assumption about token availability
		if (!this.accessToken) {
			// In a real scenario, we might need to refresh token logic here or expect it pre-refreshed
			// For now, we assume valid access token is passed
			throw new Error('Google Drive driver requires accessToken')
		}
	}

	// Helper to find or create a folder
	// Note: Google Drive uses IDs, not paths. We need to mimic path structure or just dump everything in one folder?
	// Structure: Root > manifestId > chunks > chunkId
	// Structure: Root > manifestId > manifest.json

	// To keep it simple and performant, we might just put everything in one folder with prefixes? or strictly use folder structure.
	// Let's optimize: create a folder for the manifestId.

	private folderCache = new Map<string, string>() // Name -> ID

	private async findFolder(name: string, parentId?: string): Promise<string | null> {
		const q = `mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false and '${parentId || 'root'}' in parents`
		const res = await fetch(`${DRIVE_API_URL}/files?q=${encodeURIComponent(q)}`, {
			headers: { Authorization: `Bearer ${this.accessToken}` }
		})
		if (!res.ok) return null
		const data = await res.json()
		return data.files?.[0]?.id || null
	}

	private async createFolder(name: string, parentId?: string): Promise<string> {
		const metadata = {
			name,
			mimeType: 'application/vnd.google-apps.folder',
			parents: parentId ? [parentId] : undefined
		}

		const res = await fetch(`${DRIVE_API_URL}/files`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${this.accessToken}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(metadata)
		})

		if (!res.ok) throw new Error('Failed to create Drive folder')
		const data = await res.json()
		return data.id
	}

	private async ensureManifestFolder(manifestId: string): Promise<string> {
		if (this.folderCache.has(manifestId)) return this.folderCache.get(manifestId)!

		let targetParentId = this.parentFolderId

		// If we want a clean root folder logic, we just create manifestId folder there
		// Check if exists
		let folderId = await this.findFolder(manifestId, targetParentId)
		if (!folderId) {
			folderId = await this.createFolder(manifestId, targetParentId)
		}

		this.folderCache.set(manifestId, folderId)
		return folderId
	}

	async putChunk(manifestId: string, chunkMeta: BackupChunkMeta, data: Uint8Array) {
		if (!this.accessToken) throw new Error('Driver not initialized')

		const folderId = await this.ensureManifestFolder(manifestId)
		const fileName = `chunk-${chunkMeta.id}`

		// Check if exists to overwrite? Drive allows duplicates.
		// We should delete existing if any, or just create new.
		// For simplicity: multipart upload new file.

		const metadata = {
			name: fileName,
			parents: [folderId]
		}

		const form = new FormData()
		form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
		form.append(
			'file',
			new Blob([data.buffer as ArrayBuffer], {
				type: 'application/octet-stream'
			})
		)

		const res = await fetch(DRIVE_UPLOAD_URL, {
			method: 'POST',
			headers: { Authorization: `Bearer ${this.accessToken}` },
			body: form
		})

		if (!res.ok) {
			const text = await res.text()
			throw new Error(`Drive upload failed: ${res.status} ${text}`)
		}
	}

	async getChunk(manifestId: string, chunkId: string): Promise<Uint8Array> {
		if (!this.accessToken) throw new Error('Driver not initialized')

		const folderId = await this.findFolder(manifestId, this.parentFolderId)
		if (!folderId) throw new Error('Manifest folder not found')

		const fileName = `chunk-${chunkId}`
		const q = `name='${fileName}' and '${folderId}' in parents and trashed=false`

		const searchRes = await fetch(`${DRIVE_API_URL}/files?q=${encodeURIComponent(q)}`, {
			headers: { Authorization: `Bearer ${this.accessToken}` }
		})
		const searchData = await searchRes.json()
		const fileId = searchData.files?.[0]?.id

		if (!fileId) throw new Error('Chunk file not found')

		const downloadRes = await fetch(`${DRIVE_API_URL}/files/${fileId}?alt=media`, {
			headers: { Authorization: `Bearer ${this.accessToken}` }
		})

		if (!downloadRes.ok) throw new Error('Drive download failed')

		const blob = await downloadRes.blob()
		const buffer = await blob.arrayBuffer()
		return new Uint8Array(buffer)
	}

	async finalize(manifest: BackupManifest) {
		if (!this.accessToken) throw new Error('Driver not initialized')

		const folderId = await this.ensureManifestFolder(manifest.id)

		const metadata = {
			name: 'manifest.json',
			parents: [folderId]
		}

		const data = JSON.stringify(manifest, null, 2)

		const form = new FormData()
		form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
		form.append('file', new Blob([data], { type: 'application/json' }))

		const res = await fetch(DRIVE_UPLOAD_URL, {
			method: 'POST',
			headers: { Authorization: `Bearer ${this.accessToken}` },
			body: form
		})

		if (!res.ok) {
			throw new Error(`Drive finalize failed: ${res.status}`)
		}
	}

	async listManifests(): Promise<BackupManifest[]> {
		if (!this.accessToken) throw new Error('Driver not initialized')

		// List folders in parent
		const q = `mimeType='application/vnd.google-apps.folder' and '${this.parentFolderId || 'root'}' in parents and trashed=false`
		const res = await fetch(`${DRIVE_API_URL}/files?q=${encodeURIComponent(q)}`, {
			headers: { Authorization: `Bearer ${this.accessToken}` }
		})

		if (!res.ok) return []
		const data = await res.json()
		const folders = data.files as Array<{ id: string; name: string }>

		const manifests: BackupManifest[] = []

		// Search for manifest.json in each folder
		for (const folder of folders) {
			const mq = `name='manifest.json' and '${folder.id}' in parents and trashed=false`
			const mRes = await fetch(`${DRIVE_API_URL}/files?q=${encodeURIComponent(mq)}`, {
				headers: { Authorization: `Bearer ${this.accessToken}` }
			})
			const mData = await mRes.json()
			const fileId = mData.files?.[0]?.id

			if (fileId) {
				const dlRes = await fetch(`${DRIVE_API_URL}/files/${fileId}?alt=media`, {
					headers: { Authorization: `Bearer ${this.accessToken}` }
				})
				if (dlRes.ok) {
					const json = await dlRes.json()
					manifests.push(json)
				}
			}
		}

		return manifests.sort(
			(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
		)
	}
}
