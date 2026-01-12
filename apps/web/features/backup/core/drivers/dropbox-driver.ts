import {
	StorageDriver,
	DestinationConfig,
	BackupManifest,
	BackupChunkMeta
} from '../types'

const DROPBOX_API_BASE = 'https://content.dropboxapi.com/2'
const DROPBOX_RPC_BASE = 'https://api.dropboxapi.com/2'

export class DropboxDriver implements StorageDriver {
	private accessToken: string | null = null
	private rootPath: string = ''

	async init(destination: DestinationConfig) {
		// Expected config: { accessToken: string, rootPath?: string }
		// Or via OAuth2 tokens if the system unifies them.
		// For simplicity, we assume `config.accessToken` is populated.


		const config = destination.config as Record<string, string>
		
		// Prioritize OAuth2 tokens if available
		if (destination.oauth2Tokens?.access_token) {
			this.accessToken = destination.oauth2Tokens.access_token
		} else {
			this.accessToken = config.accessToken
		}

		// Handle OAuth2 token usage if present separately, or assume it's merged into config
		// In `useStorageConnectors`, we see `oauth2Tokens` are stored separately but logic might merge them.
		// For now, let's look for `accessToken` in config.

		if (!this.accessToken) {
			throw new Error('Dropbox driver requires accessToken')
		}

		this.rootPath = config.rootPath || ''
		// Ensure root path starts with / if not empty
		if (this.rootPath && !this.rootPath.startsWith('/')) {
			this.rootPath = '/' + this.rootPath
		}
		// No trailing slash
		if (this.rootPath.endsWith('/')) {
			this.rootPath = this.rootPath.slice(0, -1)
		}
	}

	private getPath(manifestId: string, fileName: string) {
		return `${this.rootPath}/${manifestId}/${fileName}`
	}

	async putChunk(
		manifestId: string,
		chunkMeta: BackupChunkMeta,
		data: Uint8Array
	) {
		if (!this.accessToken) throw new Error('Driver not initialized')

		const path = this.getPath(manifestId, `chunks/${chunkMeta.id}`)

		// Dropbox Upload API (max 150MB per request, our chunks are 8MB default)
		const args = {
			path,
			mode: 'overwrite',
			autorename: false,
			mute: true
		}

		const res = await fetch(`${DROPBOX_API_BASE}/files/upload`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${this.accessToken}`,
				'Content-Type': 'application/octet-stream',
				'Dropbox-API-Arg': JSON.stringify(args)
			},
			body: new Blob([data.buffer as ArrayBuffer])
		})

		if (!res.ok) {
			const text = await res.text()
			throw new Error(`Dropbox upload failed: ${res.status} ${text}`)
		}
	}

	async getChunk(manifestId: string, chunkId: string): Promise<Uint8Array> {
		if (!this.accessToken) throw new Error('Driver not initialized')

		const path = this.getPath(manifestId, `chunks/${chunkId}`)
		const args = { path }

		const res = await fetch(`${DROPBOX_API_BASE}/files/download`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${this.accessToken}`,
				'Dropbox-API-Arg': JSON.stringify(args)
			}
		})

		if (!res.ok) {
			throw new Error(`Dropbox download failed: ${res.status}`)
		}

		const blob = await res.blob()
		const buffer = await blob.arrayBuffer()
		return new Uint8Array(buffer)
	}

	async finalize(manifest: BackupManifest) {
		if (!this.accessToken) throw new Error('Driver not initialized')

		const path = this.getPath(manifest.id, 'manifest.json')
		const args = {
			path,
			mode: 'overwrite',
			autorename: false,
			mute: true
		}

		const data = JSON.stringify(manifest, null, 2)

		const res = await fetch(`${DROPBOX_API_BASE}/files/upload`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${this.accessToken}`,
				'Content-Type': 'application/octet-stream',
				'Dropbox-API-Arg': JSON.stringify(args)
			},
			body: data
		})

		if (!res.ok) {
			const text = await res.text()
			throw new Error(`Dropbox finalize failed: ${res.status} ${text}`)
		}
	}

	async listManifests(): Promise<BackupManifest[]> {
		if (!this.accessToken) throw new Error('Driver not initialized')

		// 1. List folders in root (each folder = one backup ID potentially)
		// OR using search? List folder is safer.

		const listRes = await fetch(`${DROPBOX_RPC_BASE}/files/list_folder`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${this.accessToken}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				path: this.rootPath || '', // empty string for root if no rootPath
				recursive: false
			})
		})

		if (!listRes.ok) {
			// If root path doesn't exist, maybe no backups yet
			// Dropbox returns 409 path/not_found
			return []
		}

		const listData = await listRes.json()
		const entries = listData.entries as Array<{
			'.tag': string
			name: string
		}>

		// Filter for folders
		const folders = entries
			.filter((e) => e['.tag'] === 'folder')
			.map((e) => e.name)

		const manifests: BackupManifest[] = []

		// Check for manifest.json in each folder
		// This is N+1 queries, not ideal but robust for Dropbox
		for (const folder of folders) {
			const path = this.getPath(folder, 'manifest.json')
			// Try download
			try {
				const dlArg = { path }
				const res = await fetch(`${DROPBOX_API_BASE}/files/download`, {
					method: 'POST',
					headers: {
						Authorization: `Bearer ${this.accessToken}`,
						'Dropbox-API-Arg': JSON.stringify(dlArg)
					}
				})

				if (res.ok) {
					const json = await res.json()
					manifests.push(json)
				}
			} catch (e) {
				// ignore
			}
		}

		return manifests.sort(
			(a, b) =>
				new Date(b.createdAt).getTime() -
				new Date(a.createdAt).getTime()
		)
	}
}
