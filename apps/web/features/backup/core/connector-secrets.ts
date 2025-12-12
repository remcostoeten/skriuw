import { encryptSecret, decryptSecret } from '@/lib/crypto/secret'

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
	direction: 'encrypt' | 'decrypt'
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
				} catch {
					next[field.name] = ''
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
	direction: 'encrypt' | 'decrypt'
): OAuth2Tokens | undefined {
	if (!oauth2Tokens) return undefined

	const processed: Record<string, string> = {}
	for (const [key, value] of Object.entries(oauth2Tokens)) {
		if (value) {
			if (direction === 'encrypt') {
				processed[key] = encryptSecret(value)
			} else {
				try {
					processed[key] = decryptSecret(value)
				} catch {
					processed[key] = ''
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
			config: processConfig(connector.config, definition, 'encrypt'),
			oauth2Tokens: processOAuth2Tokens(connector.oauth2Tokens, 'encrypt'),
		}
	})
}

export function decryptConnectorStates(connectors: MaybeEncrypted[]): StorageConnectorState[] {
	return connectors.map((connector) => {
		const definition = getDefinition(connector.type)
		if (!definition) return connector
		return {
			...connector,
			config: processConfig(connector.config, definition, 'decrypt'),
			oauth2Tokens: processOAuth2Tokens(connector.oauth2Tokens, 'decrypt'),
		}
	})
}
