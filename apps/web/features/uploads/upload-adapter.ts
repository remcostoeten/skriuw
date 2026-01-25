import { isTauriAvailable } from '@skriuw/shared'
import { uploadFiles } from '@/lib/uploadthing'
import { getUserUploadKey } from './get-user-upload-key'

export type UploadResult = {
	url: string
	name: string
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

	return {
		url: `asset://${filePath}`,
		name: fileName
	}
}

export async function uploadFile(file: File): Promise<UploadResult> {
	if (isTauriAvailable()) {
		return uploadWithTauriFs(file)
	}
	return uploadWithUploadThing(file)
}

