import { encryptSecret, decryptSecret } from '@/lib/crypto/secret'

import { logger } from '@/lib/logger'

import { STORAGE_CONNECTOR_DEFINITIONS } from './connectors'
import type {
	StorageConnectorDefinition,
	StorageConnectorState,
	StorageConnectorType,
	OAuth2Tokens,
} from './types'

type MaybeEncrypted = StorageConnectorState & { encrypted?: boolean }

function getDefinition(type: StorageConnectorType): StorageConnectorDefinition | undefined {
	return STORAGE_CONNECTOR_DEFINITIONS.find((d) => d.type === type)
}

function processConfig(
	config: Record<string, string>,
	definition: StorageConnectorDefinition,
	direction: 'encrypt' | 'decrypt',
	connectorId?: string
): Record<string, string> {
	const next: Record<string, string> = {}
	for (const field of definition.fields) {
		const value = config[field.name]
		if (value == null) continue
		if (field.secret) {
			if (direction === 'encrypt') {
				next[field.name] = encryptSecret(value)
			} else {
				try {
					next[field.name] = decryptSecret(value)
				} catch (error) {
					logger.warn(
						'general',
						`Failed to decrypt field '${field.name}' for connector ${connectorId}: ${error}`,
						{ error }
					)
					next[field.name] = '__DECRYPTION_FAILED__'
				}
			}
		} else {
			next[field.name] = value
		}
	}
	return next
}

function processOAuth2Tokens(
	oauth2Tokens: OAuth2Tokens | undefined,
	direction: 'encrypt' | 'decrypt',
	connectorId?: string
): OAuth2Tokens | undefined {
	if (!oauth2Tokens) return undefined

	const processed: Record<string, string | number> = {}
	for (const [key, value] of Object.entries(oauth2Tokens)) {
		if (value !== undefined && value !== null) {
			const asString = typeof value === 'string' ? value : String(value)
			if (direction === 'encrypt') {
				processed[key] = encryptSecret(asString)
			} else {
				try {
					const decrypted = decryptSecret(value as unknown as string)
					processed[key] = key === 'expires_in' ? Number(decrypted) : decrypted
				} catch (error) {
					logger.warn(
						'general',
						`Failed to decrypt OAuth2 token '${key}' for connector ${connectorId}: ${error}`,
						{ error }
					)
					processed[key] = '__DECRYPTION_FAILED__'
				}
			}
		}
	}
	return processed as unknown as OAuth2Tokens
}

export function encryptConnectorStates(
	connectors: StorageConnectorState[]
): StorageConnectorState[] {
	return connectors.map((connector) => {
		const definition = getDefinition(connector.type)
		if (!definition) return connector
		return {
			...connector,
			config: processConfig(connector.config, definition, 'encrypt', connector.id),
			oauth2Tokens: processOAuth2Tokens(connector.oauth2Tokens, 'encrypt', connector.id),
		}
	})
}

export function decryptConnectorStates(connectors: MaybeEncrypted[]): StorageConnectorState[] {
	return connectors.map((connector) => {
		const definition = getDefinition(connector.type)
		if (!definition) return connector
		return {
			...connector,
			config: processConfig(connector.config, definition, 'decrypt', connector.id),
			oauth2Tokens: processOAuth2Tokens(connector.oauth2Tokens, 'decrypt', connector.id),
		}
	})
}
