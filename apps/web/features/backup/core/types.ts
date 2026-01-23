export type DestinationType = 'memory' | 'download' | (string & {})

export type DestinationFieldType = 'text' | 'secret' | 'url' | 'path' | 'number' | 'switch'

export type DestinationField = {
	name: string
	label: string
	type: DestinationFieldType
	required?: boolean
	placeholder?: string
	help?: string
	defaultValue?: string | number | boolean
	options?: Array<{ label: string; value: string }>
}

export type DestinationSchema = {
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

export type DestinationConfig = {
	id: string
	type: DestinationType
	name: string
	enabled: boolean
	encrypt: boolean
	chunkSize?: number
	config: Record<string, string | number | boolean | null | undefined>
	oauth2Tokens?: OAuth2Tokens
}

export type BackupChunkMeta = {
	id: string
	index: number
	size: number
	checksum: string
}

export type BackupManifest = {
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

export type BackupPayload = {
	id?: string
	version?: string
	createdAt?: string
	bytes: Uint8Array
	metadata?: Record<string, unknown>
}

export type BackupVerificationResult = {
	manifestId: string
	ok: boolean
	details?: string
}

export type StorageDriver = {
	init?(destination: DestinationConfig): Promise<void> | void
	putChunk(manifestId: string, chunk: BackupChunkMeta, data: Uint8Array): Promise<void>
	getChunk?(manifestId: string, chunkId: string): Promise<Uint8Array>
	finalize(manifest: BackupManifest): Promise<void>
	listManifests?(): Promise<BackupManifest[]>
	verify?(manifestId: string): Promise<BackupVerificationResult>
	dispose?(): Promise<void>
}

export type EncryptionHandler = {
	encrypt(data: Uint8Array, context: { manifestId: string; chunkId: string }): Promise<Uint8Array>
	decrypt(data: Uint8Array, context: { manifestId: string; chunkId: string }): Promise<Uint8Array>
}

export type BackupJob = {
	manifest: BackupManifest
	status: 'pending' | 'running' | 'succeeded' | 'failed'
	error?: string
}

// Storage connector configuration (S3, Dropbox, Google Drive)
export type StorageConnectorType = 's3' | 'dropbox' | 'google-drive'

export type StorageConnectorStatus = 'disconnected' | 'configured' | 'connected' | 'error'

export type StorageConnectorField = {
	name: string
	label: string
	placeholder?: string
	help?: string
	secret?: boolean
	required?: boolean
	type?: 'text' | 'oauth2'
}

export type OAuth2Config = {
	clientId: string
	redirectUri: string
	scope: string
	authUrl: string
	tokenUrl: string
}

export type OAuth2Tokens = {
	access_token: string
	refresh_token?: string
	expires_in?: number
	scope?: string
	token_type?: string
}

export type StorageConnectorDefinition = {
	type: StorageConnectorType
	label: string
	description: string
	fields: StorageConnectorField[]
	docsUrl?: string
}

export type StorageConnectorState = {
	id: string
	type: StorageConnectorType
	name: string
	status: StorageConnectorStatus
	lastValidatedAt?: string
	lastError?: string | null
	config: Record<string, string>
	oauth2Tokens?: OAuth2Tokens
}
