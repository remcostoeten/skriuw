import { beforeEach, describe, expect, it } from 'vitest'

import { STORAGE_CONNECTOR_DEFINITIONS } from './connectors'
import { decryptConnectorStates, encryptConnectorStates } from './connector-secrets'

const baseConnectors = [
	{
		id: 'one',
		type: 's3' as const,
		name: 'S3',
		status: 'connected' as const,
		config: {
			accessKeyId: 'AKIA123',
			secretAccessKey: 'secret',
			region: 'us-east-1',
			bucket: 'bucket',
		},
	},
	{
		id: 'two',
		type: 'dropbox' as const,
		name: 'Dropbox',
		status: 'connected' as const,
		config: {
			accessToken: 'token',
			rootPath: '/Apps/Skriuw',
		},
	},
	{
		id: 'three',
		type: 'google-drive' as const,
		name: 'Drive',
		status: 'connected' as const,
		config: {
			clientId: 'cid',
			clientSecret: 'csecret',
			refreshToken: 'rtoken',
			folderId: 'folder',
		},
	},
]

describe('connector-secrets', () => {
	beforeEach(() => {
		process.env.CONNECTOR_ENCRYPTION_KEY = 'test-key'
	})

	it('encrypts and decrypts secret fields while preserving non-secret fields', () => {
		const encrypted = encryptConnectorStates(baseConnectors as any)
		encrypted.forEach((c, idx) => {
			const definition = STORAGE_CONNECTOR_DEFINITIONS[idx]
			definition.fields
				.filter((f) => f.secret)
				.forEach((f) => {
					expect(c.config[f.name]).not.toBe((baseConnectors[idx] as any).config[f.name])
				})
		})

		const decrypted = decryptConnectorStates(encrypted as any)
		expect(decrypted).toEqual(baseConnectors)
	})
})
