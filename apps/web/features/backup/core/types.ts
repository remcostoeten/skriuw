export type DestinationType = 'memory' | 'download' | (string & {})

export type DestinationFieldType = 'text' | 'secret' | 'url' | 'path' | 'number' | 'switch'

export interface DestinationField {
	name: string
	label: string
	type: DestinationFieldType
	required?: boolean
	placeholder?: string
	help?: string
	defaultValue?: string | number | boolean
	options?: Array<{ label: string; value: string }>
}

export interface DestinationSchema {
	type: DestinationType
	label: string
	description: string
	fields: DestinationField[]
	defaults?: {
		encrypt?: boolean
		chunkSize?: number
	}
	notes?: string
}

export interface DestinationConfig {
	id: string
	type: DestinationType
	name: string
	enabled: boolean
	encrypt: boolean
	chunkSize?: number
	config: Record<string, string | number | boolean | null | undefined>
}

export interface BackupChunkMeta {
	id: string
	index: number
	size: number
	checksum: string
}

export interface BackupManifest {
	id: string
	destinationId: string
	version: string
	createdAt: string
	chunkSize: number
	totalBytes: number
	chunks: BackupChunkMeta[]
	encrypted: boolean
	metadata?: Record<string, unknown>
}

export interface BackupPayload {
	id?: string
	version?: string
	createdAt?: string
	bytes: Uint8Array
	metadata?: Record<string, unknown>
}

export interface BackupVerificationResult {
	manifestId: string
	ok: boolean
	details?: string
}

export interface StorageDriver {
	init?(destination: DestinationConfig): Promise<void> | void
	putChunk(manifestId: string, chunk: BackupChunkMeta, data: Uint8Array): Promise<void>
	getChunk?(manifestId: string, chunkId: string): Promise<Uint8Array>
	finalize(manifest: BackupManifest): Promise<void>
	listManifests?(): Promise<BackupManifest[]>
	verify?(manifestId: string): Promise<BackupVerificationResult>
	dispose?(): Promise<void>
}

export interface EncryptionHandler {
	encrypt(data: Uint8Array, context: { manifestId: string; chunkId: string }): Promise<Uint8Array>
	decrypt?(data: Uint8Array, context: { manifestId: string; chunkId: string }): Promise<Uint8Array>
}

export interface BackupJob {
	manifest: BackupManifest
	status: 'pending' | 'running' | 'succeeded' | 'failed'
	error?: string
}
