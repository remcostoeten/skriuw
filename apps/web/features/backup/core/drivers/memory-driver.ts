import type { BackupManifest, BackupVerificationResult, DestinationConfig, StorageDriver } from "../types";
import { generateId } from "@skriuw/shared";

type StoredEntry = {
	manifest: BackupManifest | null
	chunks: Map<string, Uint8Array>
}

/**
 * Ephemeral driver intended for tests and local development.
 */
export function createMemoryDriver(): StorageDriver {
	const manifests = new Map<string, StoredEntry>()

	return {
		async init(destination: DestinationConfig) {
			if (!destination.id) {
				throw new Error('Destination id is required')
			}
		},

		async putChunk(manifestId, chunkMeta, data) {
			const entry = manifests.get(manifestId) ?? { manifest: null, chunks: new Map() }
			entry.chunks.set(chunkMeta.id, data)
			manifests.set(manifestId, entry)
		},

		async finalize(manifest) {
			const entry = manifests.get(manifest.id)
			if (!entry) {
				throw new Error('Cannot finalize manifest without chunks')
			}
			entry.manifest = manifest
			manifests.set(manifest.id, entry)
		},

		async getChunk(manifestId, chunkId) {
			const entry = manifests.get(manifestId)
			if (!entry) {
				throw new Error('Manifest not found')
			}
			const chunk = entry.chunks.get(chunkId)
			if (!chunk) {
				throw new Error('Chunk not found')
			}
			return chunk
		},

		async listManifests() {
			return Array.from(manifests.values())
				.map((entry) => entry.manifest)
				.filter(Boolean) as BackupManifest[]
		},

		async verify(manifestId): Promise<BackupVerificationResult> {
			const entry = manifests.get(manifestId)
			if (!entry?.manifest) {
				return { manifestId, ok: false, details: 'Manifest missing' }
			}

			const missing = entry.manifest.chunks.find((chunk) => !entry.chunks.has(chunk.id))
			if (missing) {
				return {
					manifestId,
					ok: false,
					details: `Missing chunk ${missing.id}`
				}
			}

			return { manifestId, ok: true }
		},

		async dispose() {
			manifests.clear()
		}
	}
}

/**
 * Convenience helper to seed an in-memory archive in tests.
 */
export function seedMemoryArchive(): {
	destination: DestinationConfig
	driver: StorageDriver
	manifestId: string
} {
	const manifestId = generateId('manifest-')
	return {
		destination: {
			id: 'memory',
			type: 'memory',
			name: 'In-memory',
			enabled: true,
			encrypt: false,
			config: {}
		},
		driver: createMemoryDriver(),
		manifestId
	}
}
