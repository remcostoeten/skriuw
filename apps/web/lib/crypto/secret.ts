import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'
import { env } from '@skriuw/env/server'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // recommended for GCM

function getKey(): Buffer {
	// Use a specific key for connector encryption, falling back to auth secret
	const secret = env.CONNECTOR_ENCRYPTION_KEY || env.BETTER_AUTH_SECRET
	if (!secret || secret.length < 16) {
		throw new Error(
			'CONNECTOR_ENCRYPTION_KEY (preferred) or BETTER_AUTH_SECRET must be set and at least 16 characters'
		)
	}
	return createHash('sha256').update(secret).digest()
}

export function encryptSecret(plainText: string): string {
	const key = getKey()
	const iv = randomBytes(IV_LENGTH)
	const cipher = createCipheriv(ALGORITHM, key, iv)
	const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()])
	const authTag = cipher.getAuthTag()
	return Buffer.concat([iv, authTag, encrypted]).toString('base64')
}

export function decryptSecret(payload: string): string {
	const key = getKey()
	const buffer = Buffer.from(payload, 'base64')
	const iv = buffer.subarray(0, IV_LENGTH)
	const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + 16)
	const data = buffer.subarray(IV_LENGTH + 16)
	const decipher = createDecipheriv(ALGORITHM, key, iv)
	decipher.setAuthTag(authTag)
	const decrypted = Buffer.concat([decipher.update(data), decipher.final()])
	return decrypted.toString('utf8')
}
