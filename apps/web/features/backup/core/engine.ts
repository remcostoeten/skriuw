import type {
	BackupChunkMeta,
	BackupManifest,
	BackupPayload,
	DestinationConfig,
	EncryptionHandler,
	StorageDriver
} from './types'
import { generateId } from '@skriuw/shared'

const DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024 // 8 MB

async function toHexSha256(data: Uint8Array): Promise<string> {
	if (typeof crypto !== 'undefined' && crypto.subtle) {
		const digest = await crypto.subtle.digest('SHA-256', data as any)
		return Array.from(new Uint8Array(digest))
			.map((b) => b.toString(16).padStart(2, '0'))
			.join('')
	}

	throw new Error('WebCrypto unavailable: cannot compute SHA-256 chunk checksum')
}

function chunkBuffer(
	payload: Uint8Array,
	chunkSize: number
): Array<{ chunk: Uint8Array; meta: BackupChunkMeta }> {
	const chunks: Array<{ chunk: Uint8Array; meta: BackupChunkMeta }> = []
	let index = 0

	for (let offset = 0; offset < payload.length; offset += chunkSize) {
		const slice = payload.slice(offset, offset + chunkSize)
		const id = generateId('chunk-')
		chunks.push({
			chunk: slice,
			meta: {
				id,
				index,
				size: slice.byteLength,
				checksum: ''
			}
		})
		index++
	}

	return chunks
}

export type BackupRunOptions = {
	driver: StorageDriver
	destination: DestinationConfig
	payload: BackupPayload
	chunkSize?: number
	encryption?: EncryptionHandler
}

export async function runBackup({
	driver,
	destination,
	payload,
	chunkSize = DEFAULT_CHUNK_SIZE,
	encryption
}: BackupRunOptions): Promise<BackupManifest> {
	const manifestId = payload.id ?? generateId('manifest-')
	const createdAt = payload.createdAt ?? new Date().toISOString()
	const version = payload.version ?? '1.0'
	const isEncrypted = Boolean(encryption)
	if (destination.encrypt && !encryption) {
		throw new Error('Destination requires encryption but no encryption handler provided')
	}
	const manifestChunks: BackupChunkMeta[] = []

	await driver.init?.(destination)

	const chunked = chunkBuffer(payload.bytes, chunkSize)

	for (const { chunk, meta } of chunked) {
		const chunkId = meta.id

		const encryptedChunk = encryption
			? await encryption.encrypt(chunk, { manifestId, chunkId })
			: chunk

		const checksum = await toHexSha256(encryptedChunk)
		meta.checksum = checksum

		await driver.putChunk(manifestId, meta, encryptedChunk)
		manifestChunks.push(meta)
	}

	const manifest: BackupManifest = {
		id: manifestId,
		destinationId: destination.id,
		version,
		createdAt,
		chunkSize,
		totalBytes: payload.bytes.byteLength,
		chunks: manifestChunks,
		encrypted: isEncrypted,
		metadata: payload.metadata
	}

	await driver.finalize(manifest)

	return manifest
}

export async function restoreChunk(
	driver: StorageDriver,
	manifestId: string,
	chunkId: string,
	encryption?: EncryptionHandler
): Promise<Uint8Array> {
	if (!driver.getChunk) {
		throw new Error('Driver does not support reading chunks')
	}

	const raw = await driver.getChunk(manifestId, chunkId)
	return encryption?.decrypt ? encryption.decrypt(raw, { manifestId, chunkId }) : raw
}
