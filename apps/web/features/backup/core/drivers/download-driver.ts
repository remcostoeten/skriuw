import type { BackupManifest, DestinationConfig, StorageDriver, BackupVerificationResult } from '../types'

interface DownloadArchive {
	manifest: BackupManifest | null
	chunks: Array<{ id: string; data: string }>
}

function toBase64(buffer: Uint8Array): string {
	if (typeof btoa !== 'undefined') {
		let binary = ''
		buffer.forEach((b) => (binary += String.fromCharCode(b)))
		return btoa(binary)
	}
	if (typeof Buffer !== 'undefined') {
		return Buffer.from(buffer).toString('base64')
	}
	throw new Error('No base64 encoder available')
}

function fromBase64(encoded: string): Uint8Array {
	if (typeof atob !== 'undefined') {
		const binary = atob(encoded)
		const bytes = new Uint8Array(binary.length)
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i)
		}
		return bytes
	}
	if (typeof Buffer !== 'undefined') {
		return Uint8Array.from(Buffer.from(encoded, 'base64'))
	}
	throw new Error('No base64 decoder available')
}

function triggerDownload(content: string, filename: string, mimeType: string): void {
	const blob = new Blob([content], { type: mimeType })
	const url = URL.createObjectURL(blob)
	const link = document.createElement('a')
	link.href = url
	link.download = filename
	document.body.appendChild(link)
	link.click()
	document.body.removeChild(link)
	URL.revokeObjectURL(url)
}

/**
 * Driver that emits a browser download containing manifest + chunk payloads.
 * Useful as a bridge to the existing file-export flow.
 */
export function createDownloadDriver(options?: { filenamePrefix?: string }): StorageDriver {
	const archives = new Map<string, DownloadArchive>()
	const filenamePrefix = options?.filenamePrefix ?? 'skriuw-backup'

	return {
		async init(destination: DestinationConfig) {
			if (!destination.enabled) {
				throw new Error('Destination disabled')
			}
		},

		async putChunk(manifestId, chunkMeta, data) {
			const archive: DownloadArchive =
				archives.get(manifestId) ?? { manifest: null, chunks: [] }
			archive.chunks.push({ id: chunkMeta.id, data: toBase64(data) })
			archives.set(manifestId, archive)
		},

		async finalize(manifest) {
			const archive = archives.get(manifest.id)
			if (!archive) {
				throw new Error('No chunks recorded for manifest')
			}

			archive.manifest = manifest
			const payload = JSON.stringify(archive, null, 2)
			const timestamp = manifest.createdAt.split('T')[0]
			const filename = `${filenamePrefix}-${timestamp}.json`
			triggerDownload(payload, filename, 'application/json')

			archives.set(manifest.id, archive)
		},

		async getChunk(manifestId, chunkId) {
			const archive = archives.get(manifestId)
			if (!archive) {
				throw new Error('Manifest not found')
			}
			const chunk = archive.chunks.find((c) => c.id === chunkId)
			if (!chunk) {
				throw new Error('Chunk not found')
			}
			return fromBase64(chunk.data)
		},

		async listManifests() {
			return Array.from(archives.values())
				.map((entry) => entry.manifest)
				.filter((manifest): manifest is BackupManifest => Boolean(manifest))
		},

		async verify(manifestId): Promise<BackupVerificationResult> {
			const archive = archives.get(manifestId)
			if (!archive?.manifest) {
				return { manifestId, ok: false, details: 'Archive missing' }
			}
			return { manifestId, ok: true }
		},
	}
}
