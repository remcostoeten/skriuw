import { useCallback, useMemo, useState } from 'react'

import { useSettingsContext } from '../../settings/settings-provider'
import { STORAGE_CONNECTOR_DEFINITIONS } from '../core/connectors'
import type {
	StorageConnectorDefinition,
	StorageConnectorState,
	StorageConnectorType,
} from '../core/types'
import { validateConnectorConfig } from '../core/validation'
import type { OAuth2Tokens } from '../core/types'

function generateConnectorId(type: StorageConnectorType): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID()
	}
	const random = Math.random().toString(36).slice(2, 8)
	return `${type}-${random}`
}

function normalizeConfig(definition: StorageConnectorDefinition, config: Record<string, string>) {
	const normalized: Record<string, string> = {}
	for (const field of definition.fields) {
		const value = config[field.name]
		if (value !== undefined) {
			normalized[field.name] = String(value)
		}
	}
	return normalized
}

function findMissingFields(definition: StorageConnectorDefinition, config: Record<string, string>) {
	return definition.fields
		// Skip OAuth2 fields - they use oauth2Tokens, not config values
		.filter((field) => field.type !== 'oauth2' && field.required && !config[field.name]?.trim())
		.map((field) => field.label)
}

export function useStorageConnectors() {
	const { settings, updateSetting } = useSettingsContext()
	const [testingConnector, setTestingConnector] = useState<StorageConnectorType | null>(null)

	const connectors = (settings.storageConnectors as StorageConnectorState[] | undefined) ?? []

	const definitions = STORAGE_CONNECTOR_DEFINITIONS

	const definitionsMap = useMemo(() => {
		return definitions.reduce<Record<StorageConnectorType, StorageConnectorDefinition>>(
			(acc, def) => {
				acc[def.type] = def
				return acc
			},
			{} as Record<StorageConnectorType, StorageConnectorDefinition>
		)
	}, [definitions])

	const persist = useCallback(
		(next: StorageConnectorState[]) => {
			updateSetting('storageConnectors', next)
		},
		[updateSetting]
	)

	const saveConnector = useCallback(
		async (
			type: StorageConnectorType,
			name: string,
			config: Record<string, string>,
			oauth2Tokens?: OAuth2Tokens
		) => {
			const definition = definitionsMap[type]
			if (!definition) {
				throw new Error(`Unknown connector type: ${type}`)
			}

			const normalizedConfig = normalizeConfig(definition, config)
			validateConnectorConfig(type, normalizedConfig)
			const missing = findMissingFields(definition, normalizedConfig)

			if (missing.length > 0) {
				throw new Error(`Missing required fields: ${missing.join(', ')}`)
			}

			const existing = connectors.find((connector) => connector.type === type)
			const now = new Date().toISOString()

			const updated: StorageConnectorState = {
				id: existing?.id ?? generateConnectorId(type),
				type,
				name: name || definition.label,
				status: 'configured',
				lastValidatedAt: now,
				lastError: null,
				config: normalizedConfig,
				oauth2Tokens,
			}

			const nextConnectors = [...connectors.filter((connector) => connector.type !== type), updated]

			persist(nextConnectors)
			return updated
		},
		[connectors, definitionsMap, persist]
	)

	const testConnector = useCallback(
		async (
			type: StorageConnectorType,
			config: Record<string, string>,
			name?: string,
			oauth2Tokens?: OAuth2Tokens
		) => {
			setTestingConnector(type)
			try {
				const definition = definitionsMap[type]
				if (!definition) throw new Error(`Unknown connector: ${type}`)

				const normalized = normalizeConfig(definition, config)
				validateConnectorConfig(type, normalized)
				const missing = findMissingFields(definition, normalized)

				if (missing.length > 0) {
					throw new Error(`Missing required fields: ${missing.join(', ')}`)
				}

				// Check if OAuth is required but no tokens are provided
				const hasOAuth2Field = definition.fields.some((f) => f.type === 'oauth2' && f.required)
				if (hasOAuth2Field && !oauth2Tokens?.access_token) {
					throw new Error('Please connect via OAuth first using the "Connect" button')
				}

				// Real handshake call
				const controller = new AbortController()
				const timeoutId = setTimeout(() => controller.abort(), 10000)

				let res: Response
				try {
					res = await fetch('/api/storage/connectors/test', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ type, config: normalized, oauth2Tokens }),
						signal: controller.signal,
					})
				} finally {
					clearTimeout(timeoutId)
				}

				if (!res.ok) {
					const data = await res.json().catch(() => ({}))
					throw new Error(data?.message || `Handshake failed (${res.status})`)
				}

				const existing = connectors.find((c) => c.type === type)

				const success: StorageConnectorState = {
					id: existing?.id ?? generateConnectorId(type),
					type,
					name: name || existing?.name || definition.label,
					status: 'connected',
					lastValidatedAt: new Date().toISOString(),
					lastError: null,
					config: normalized,
					oauth2Tokens,
				}

				persist([...connectors.filter((connector) => connector.type !== type), success])

				return success
			} catch (error) {
				let message = error instanceof Error ? error.message : 'Failed to validate connector'
				if (error instanceof Error && error.name === 'AbortError') {
					message = 'Connection timed out after 10s'
				}
				const existing = connectors.find((connector) => connector.type === type)
				// Only persist error state for existing connectors to avoid creating new ones on failure
				if (existing) {
					const fallback: StorageConnectorState = {
						id: existing.id,
						type,
						name: existing.name,
						status: 'error',
						lastValidatedAt: existing.lastValidatedAt,
						lastError: message,
						config: existing.config,
						oauth2Tokens: existing.oauth2Tokens,
					}
					persist([...connectors.filter((connector) => connector.type !== type), fallback])
				}
				throw new Error(message)
			} finally {
				setTestingConnector(null)
			}
		},
		[connectors, definitionsMap, persist]
	)

	const disconnectConnector = useCallback(
		(type: StorageConnectorType) => {
			const existing = connectors.find((connector) => connector.type === type)
			if (!existing) return

			const now = new Date().toISOString()
			const updated: StorageConnectorState = {
				...existing,
				status: 'disconnected',
				lastValidatedAt: now,
				lastError: null,
			}

			persist([...connectors.filter((connector) => connector.type !== type), updated])
		},
		[connectors, persist]
	)

	const removeConnector = useCallback(
		(type: StorageConnectorType) => {
			const next = connectors.filter((connector) => connector.type !== type)
			persist(next)
		},
		[connectors, persist]
	)

	const connectWithOAuth2 = useCallback(
		async (
			type: StorageConnectorType,
			name: string,
			config: Record<string, string>,
			oauth2Tokens: OAuth2Tokens
		) => {
			return saveConnector(type, name, config, oauth2Tokens)
		},
		[saveConnector]
	)

	return {
		definitions,
		connectors,
		saveConnector,
		testConnector,
		disconnectConnector,
		removeConnector,
		connectWithOAuth2,
		testingConnector,
	}
}
