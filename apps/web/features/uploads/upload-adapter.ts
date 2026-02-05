import { isTauriAvailable } from '@skriuw/shared'
import { uploadFiles } from '@/lib/uploadthing'
import { getUserUploadKey } from './get-user-upload-key'

export type UploadResult = {
	url: string
	name: string
}

/**
 * Sync uploaded file to database via API (for Tauri/local uploads)
 */
async function syncToDatabase(
	result: UploadResult,
	storageProvider: 'tauri' | 'local-fs',
	file: File
): Promise<void> {
	try {
		await fetch('/api/assets', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				url: result.url,
				name: result.name,
				originalName: file.name,
				size: file.size,
				type: file.type || 'unknown',
				storageProvider
			})
		})
	} catch (error) {
		// Non-critical: log but don't fail the upload
		console.warn('Failed to sync file to database:', error)
	}
}

async function uploadWithUploadThing(file: File): Promise<UploadResult> {
	const userKey = await getUserUploadKey()

	const response = await uploadFiles('coverImageUploader', {
		files: [file],
		headers: userKey ? { 'x-uploadthing-token': userKey } : undefined
	})
	if (!response || response.length === 0) {
		throw new Error('Upload failed')
	}
	return {
		url: response[0].ufsUrl,
		name: response[0].name
	}
}

async function uploadWithTauriFs(file: File): Promise<UploadResult> {
	const { writeFile, mkdir } = await import('@tauri-apps/plugin-fs')
	const { appDataDir, join } = await import('@tauri-apps/api/path')

	const appData = await appDataDir()
	const assetsDir = await join(appData, 'assets')
	const fileName = `${Date.now()}-${file.name}`
	const filePath = await join(assetsDir, fileName)

	await mkdir(assetsDir, { recursive: true })
	const buffer = await file.arrayBuffer()
	await writeFile(filePath, new Uint8Array(buffer))

	const result = {
		url: `asset://${filePath}`,
		name: fileName
	}

	// Sync to database
	await syncToDatabase(result, 'tauri', file)

	return result
}

async function uploadWithLocalStorage(file: File): Promise<UploadResult> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = async () => {
			if (typeof reader.result === 'string') {
				const result = {
					url: reader.result,
					name: file.name
				}
				// Note: local-fs (base64) uploads are guest-only, skip DB sync
				resolve(result)
			} else {
				reject(new Error('Failed to convert file to base64'))
			}
		}
		reader.onerror = () => reject(reader.error)
		reader.readAsDataURL(file)
	})
}

export async function uploadFile(file: File, isGuest = false): Promise<UploadResult> {
	if (isTauriAvailable()) {
		return uploadWithTauriFs(file)
	}

	// If guest, use local storage (base64)
	if (isGuest) {
		return uploadWithLocalStorage(file)
	}

	return uploadWithUploadThing(file)
}

