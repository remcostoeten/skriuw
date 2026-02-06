import { StorageDriver, DestinationConfig, BackupManifest, BackupChunkMeta } from '../types'
import { createHash, createHmac } from 'crypto'

// Helper for AWS Signature V4
async function s3Fetch(
	method: string,
	path: string,
	config: Record<string, string>,
	body?: Uint8Array | string,
	headers: Record<string, string> = {}
): Promise<Response> {
	const { accessKeyId, secretAccessKey, region, bucket, endpoint } = config
	const host = endpoint ? new URL(endpoint).host : `${bucket}.s3.${region}.amazonaws.com`
	const proto = endpoint ? new URL(endpoint).protocol : 'https:'
	const url = endpoint
		? `${endpoint.replace(/\/$/, '')}/${bucket}${path}`
		: `${proto}//${host}${path}`

	const amzDate = new Date()
		.toISOString()
		.replace(/[-:]/g, '')
		.replace(/\.\d{3}Z$/, 'Z')
	const dateStamp = amzDate.slice(0, 8)

	// Payload hash
	let payloadHash = 'UNSIGNED-PAYLOAD'
	if (body instanceof Uint8Array) {
		if (typeof crypto !== 'undefined' && crypto.subtle) {
			const digest = await crypto.subtle.digest('SHA-256', body.buffer as ArrayBuffer)
			payloadHash = Array.from(new Uint8Array(digest))
				.map((b) => b.toString(16).padStart(2, '0'))
				.join('')
		}
	} else if (typeof body === 'string') {
		// For manifest JSON
		if (typeof crypto !== 'undefined' && crypto.subtle) {
			const encoder = new TextEncoder()
			const data = encoder.encode(body)
			const digest = await crypto.subtle.digest('SHA-256', data)
			payloadHash = Array.from(new Uint8Array(digest))
				.map((b) => b.toString(16).padStart(2, '0'))
				.join('')
		}
	}

	// Canonical Request
	const canonicalUri = endpoint ? `/${bucket}${path}` : path
	const canonicalQuery = ''
	const canonicalHeadersList = [
		`host:${host}`,
		`x-amz-content-sha256:${payloadHash}`,
		`x-amz-date:${amzDate}`
	]
	const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'

	// Add custom headers to canonical headers
	Object.keys(headers).forEach((key) => {
		const lowerKey = key.toLowerCase()
		if (
			lowerKey !== 'host' &&
			lowerKey !== 'x-amz-content-sha256' &&
			lowerKey !== 'x-amz-date'
		) {
			// For simplicity in this implementation, we are mostly using standard headers.
			// If we needed to sign arbitrary headers, we'd add them here.
		}
	})

	const canonicalRequest = [
		method,
		canonicalUri,
		canonicalQuery,
		...canonicalHeadersList,
		'', // empty line
		signedHeaders,
		payloadHash
	].join('\n')

	// String to Sign
	const algorithm = 'AWS4-HMAC-SHA256'
	const credentialScope = `${dateStamp}/${region}/s3/aws4_request`

	let hashedCanonicalRequest = ''
	if (typeof crypto !== 'undefined' && crypto.subtle) {
		const encoder = new TextEncoder()
		const data = encoder.encode(canonicalRequest)
		const digest = await crypto.subtle.digest('SHA-256', data)
		hashedCanonicalRequest = Array.from(new Uint8Array(digest))
			.map((b) => b.toString(16).padStart(2, '0'))
			.join('')
	} else {
		// Fallback for Node environment if needed, but we targeting browser
		hashedCanonicalRequest = createHash('sha256').update(canonicalRequest).digest('hex')
	}

	const stringToSign = [algorithm, amzDate, credentialScope, hashedCanonicalRequest].join('\n')

	// Signature
	// In browser we might not have createHmac from 'crypto' available directly if not polyfilled
	// But since we are in a Next.js app that seems to support it or standard WebCrypto
	// Let's rely on the native WebCrypto for the key derivation if possible or fall back to the imported `crypto` which acts as polyfill or server-side

	// NOTE: The `crypto` import from 'crypto' usually only works in Node.js.
	// In the browser, we need strictly WebCrypto.
	// For this implementation, I will assume we are essentially in a browser environment standard setup.
	// However, the existing code imported `createHmac` from `crypto` in `handshake.ts`.
	// I will use a pure JS HMAC implementation or the imported one if it works (checking if it's node or browser).

	// Re-using the logic from handshake.ts which imports from 'crypto'.
	// If that fails in browser, we need a web-compatible one.
	// Given `handshake.ts` is likely server-side (it was used in API route), but generic util might be shared.
	// Let's assume standard Web Crypto API for the driver as it runs on client.

	async function hmacSha256(key: string | Uint8Array, data: string): Promise<Uint8Array> {
		const enc = new TextEncoder()
		const algorithm = { name: 'HMAC', hash: 'SHA-256' }
		const keyData = typeof key === 'string' ? enc.encode(key) : new Uint8Array(key)

		const cryptoKey = await crypto.subtle.importKey(
			'raw',
			keyData.buffer as ArrayBuffer,
			algorithm,
			false,
			['sign']
		)
		const signature = await crypto.subtle.sign(algorithm.name, cryptoKey, enc.encode(data))
		return new Uint8Array(signature)
	}

	const kDate = await hmacSha256('AWS4' + secretAccessKey, dateStamp)
	const kRegion = await hmacSha256(kDate, region)
	const kService = await hmacSha256(kRegion, 's3')
	const kSigning = await hmacSha256(kService, 'aws4_request')
	const signatureRaw = await hmacSha256(kSigning, stringToSign)
	const signature = Array.from(signatureRaw)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('')

	const authorization = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

	return fetch(url, {
		method,
		headers: {
			...headers,
			host,
			'x-amz-date': amzDate,
			'x-amz-content-sha256': payloadHash,
			Authorization: authorization
		},
		body: body instanceof Uint8Array ? new Blob([body.buffer as ArrayBuffer]) : body
	})
}

export class S3Driver implements StorageDriver {
	private config: Record<string, string> | null = null

	async init(destination: DestinationConfig) {
		// In a real app we might decrypt the config here if it was passed encrypted
		// For now we assume the caller passes raw config ready to use, or we might need to decrypt it if `destination.config` has encrypted values
		// Ideally the hook `useStorageConnectors` handles the decryption or retrieval of secure secrets before passing to driver
		// But in `runBackup` (engine.ts), it receives `DestinationConfig`.

		// Casting for now, assuming the engine/UI provides the decrypted config
		this.config = destination.config as Record<string, string>
	}

	async putChunk(manifestId: string, chunkMeta: BackupChunkMeta, data: Uint8Array) {
		if (!this.config) throw new Error('Driver not initialized')

		const key = `${manifestId}/chunks/${chunkMeta.id}`
		const res = await s3Fetch('PUT', `/${key}`, this.config, data, {
			'Content-Type': 'application/octet-stream'
		})

		if (!res.ok) {
			throw new Error(`S3 upload failed: ${res.status} ${res.statusText}`)
		}
	}

	async getChunk(manifestId: string, chunkId: string): Promise<Uint8Array> {
		if (!this.config) throw new Error('Driver not initialized')

		const key = `${manifestId}/chunks/${chunkId}`
		const res = await s3Fetch('GET', `/${key}`, this.config)

		if (!res.ok) {
			throw new Error(`S3 download failed: ${res.status} ${res.statusText}`)
		}

		const blob = await res.blob()
		const buffer = await blob.arrayBuffer()
		return new Uint8Array(buffer)
	}

	async finalize(manifest: BackupManifest) {
		if (!this.config) throw new Error('Driver not initialized')

		const key = `${manifest.id}/manifest.json`
		const body = JSON.stringify(manifest, null, 2)

		const res = await s3Fetch('PUT', `/${key}`, this.config, body, {
			'Content-Type': 'application/json'
		})

		if (!res.ok) {
			throw new Error(`S3 finalize failed: ${res.status} ${res.statusText}`)
		}
	}

	async listManifests(): Promise<BackupManifest[]> {
		if (!this.config) throw new Error('Driver not initialized')

		// List objects with prefix '' (root) or specific prefix
		// We assume manifests are at root level folders?
		// Our structure is: `manifestId/manifest.json`
		// So we list root, see folders (prefixes), and then get manifest.json from each?
		// Or simpler: we can just list everything and filter for `manifest.json`

		// S3 List Objects V2
		const res = await s3Fetch('GET', '/?list-type=2', this.config)
		if (!res.ok) throw new Error('Failed to list S3 objects')

		const text = await res.text()
		// Simple XML parsing
		const parser = new DOMParser()
		const xml = parser.parseFromString(text, 'text/xml')
		const contents = Array.from(xml.querySelectorAll('Contents'))

		const manifestKeys = contents
			.map((node) => node.querySelector('Key')?.textContent)
			.filter((key): key is string => !!key && key.endsWith('/manifest.json'))

		const manifests: BackupManifest[] = []
		for (const key of manifestKeys) {
			const mRes = await s3Fetch('GET', `/${key}`, this.config)
			if (mRes.ok) {
				try {
					const json = await mRes.json()
					manifests.push(json)
				} catch (e) {
					console.warn('Failed to parse manifest', key)
				}
			}
		}

		return manifests.sort(
			(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
		)
	}
}
