import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/env', () => ({
	env: {
		CONNECTOR_ENCRYPTION_KEY: '00000000000000000000000000000000',
		BETTER_AUTH_SECRET: 'test-better-auth-secret-min-32-chars-long'
	}
}))

import {
	decryptConnectorStates,
	encryptConnectorStates
} from '../../features/backup/core/connector-secrets'
import { STORAGE_CONNECTOR_DEFINITIONS } from '../../features/backup/core/connectors'

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
			bucket: 'bucket'
		},
		oauth2Tokens: undefined
	},
	{
		id: 'two',
		type: 'dropbox' as const,
		name: 'Dropbox',
		status: 'connected' as const,
		config: {
			rootPath: '/Apps/Skriuw'
		},
		oauth2Tokens: {
			access_token: 'token',
			refresh_token: 'refresh',
			token_type: 'bearer',
			expires_in: 3600
		}
	},
	{
		id: 'three',
		type: 'google-drive' as const,
		name: 'Drive',
		status: 'connected' as const,
		config: {
			folderId: 'folder'
		},
		oauth2Tokens: {
			access_token: 'drive-token',
			refresh_token: 'drive-refresh',
			scope: 'drive.file',
			token_type: 'bearer'
		}
	}
]

describe('connector-secrets', () => {
	beforeEach(() => {
		// Mock is handled globally
	})

	it('encrypts and decrypts secret fields while preserving non-secret fields', () => {
		const encrypted = encryptConnectorStates(baseConnectors as any)
		encrypted.forEach((c) => {
			const definition = STORAGE_CONNECTOR_DEFINITIONS.find((d) => d.type === c.type)
			const base = baseConnectors.find((b) => b.id === c.id)
			expect(definition).toBeDefined()
			expect(base).toBeDefined()
			definition!.fields
				.filter((f) => f.secret)
				.forEach((f) => {
					expect(c.config[f.name]).not.toBe((base as any).config[f.name])
				})
			if (base?.oauth2Tokens) {
				Object.keys(base.oauth2Tokens).forEach((tokenKey) => {
					expect(c.oauth2Tokens?.[tokenKey as keyof typeof c.oauth2Tokens]).not.toBe(
						(base as any).oauth2Tokens[tokenKey]
					)
				})
			}
		})

		const decrypted = decryptConnectorStates(encrypted as any)
		expect(decrypted).toEqual(baseConnectors)
	})
})
