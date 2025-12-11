import { encryptSecret, decryptSecret } from '@/lib/crypto/secret'

import { STORAGE_CONNECTOR_DEFINITIONS } from './connectors'
import type { StorageConnectorDefinition, StorageConnectorState, StorageConnectorType } from './types'

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

export function encryptConnectorStates(
	connectors: StorageConnectorState[]
): StorageConnectorState[] {
	return connectors.map((connector) => {
		const definition = getDefinition(connector.type)
		if (!definition) return connector
		return {
			...connector,
			config: processConfig(connector.config, definition, 'encrypt'),
		}
	})
}

export function decryptConnectorStates(
	connectors: MaybeEncrypted[]
): StorageConnectorState[] {
	return connectors.map((connector) => {
		const definition = getDefinition(connector.type)
		if (!definition) return connector
		return {
			...connector,
			config: processConfig(connector.config, definition, 'decrypt'),
		}
	})
}
