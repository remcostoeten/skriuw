import { STORAGE_CONNECTOR_DEFINITIONS } from "../core/connectors";
import type { StorageConnectorDefinition, StorageConnectorState, StorageConnectorType } from "../core/types";
import type { OAuth2Tokens } from "../core/types";
import { validateConnectorConfig } from "../core/validation";
import { useCallback, useMemo, useState, useEffect } from "react";

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
	return (
		definition.fields
			// Skip OAuth2 fields - they use oauth2Tokens, not config values
			.filter(
				(field) => field.type !== 'oauth2' && field.required && !config[field.name]?.trim()
			)
			.map((field) => field.label)
	)
}

export function useStorageConnectors() {
	const [connectors, setConnectors] = useState<StorageConnectorState[]>([])
	const [testingConnector, setTestingConnector] = useState<StorageConnectorType | null>(null)
	const [loading, setLoading] = useState(true)

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

	// Fetch connectors from API on mount
	useEffect(() => {
		async function fetchConnectors() {
			try {
				const res = await fetch('/api/storage/connectors')
				if (res.ok) {
					const data = await res.json()
					setConnectors(data.connectors || [])
				}
			} catch (error) {
				console.error('Failed to fetch connectors:', error)
			} finally {
				setLoading(false)
			}
		}
		fetchConnectors()
	}, [])

	const persist = useCallback(async (connector: StorageConnectorState) => {
		try {
			const res = await fetch('/api/storage/connectors', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(connector)
			})
			if (!res.ok) {
				throw new Error('Failed to save connector')
			}
			// Update local state
			setConnectors((prev) => {
				const existing = prev.findIndex((c) => c.type === connector.type)
				if (existing >= 0) {
					const updated = [...prev]
					updated[existing] = connector
					return updated
				}
				return [...prev, connector]
			})
		} catch (error) {
			console.error('Failed to persist connector:', error)
			throw error
		}
	}, [])

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
				oauth2Tokens
			}

			await persist(updated)
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
				const hasOAuth2Field = definition.fields.some(
					(f) => f.type === 'oauth2' && f.required
				)
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
						signal: controller.signal
					})
				} finally {
					clearTimeout(timeoutId)
				}

				if (!res.ok) {
					const data = await res.json().catch(() => ({}))
					throw new Error(data?.message || `Handshake failed (${res.status})`)
				}

				const existing = connectors.find((c) => c.type === type)
				const now = new Date().toISOString()

				const success: StorageConnectorState = {
					id: existing?.id ?? generateConnectorId(type),
					type,
					name: name || existing?.name || definition.label,
					status: 'connected',
					lastValidatedAt: now,
					lastError: null,
					config: normalized,
					oauth2Tokens
				}

				await persist(success)
				return success
			} catch (error) {
				let message =
					error instanceof Error ? error.message : 'Failed to validate connector'
				if (error instanceof Error && error.name === 'AbortError') {
					message = 'Connection timed out after 10s'
				}
				const existing = connectors.find((connector) => connector.type === type)
				// Only persist error state for existing connectors to avoid creating new ones on failure
				if (existing) {
					const errorState: StorageConnectorState = {
						...existing,
						status: 'error',
						lastError: message,
						lastValidatedAt: new Date().toISOString()
					}
					await persist(errorState).catch(() => {})
				}
				throw error
			} finally {
				setTestingConnector(null)
			}
		},
		[connectors, definitionsMap, persist]
	)

	const disconnectConnector = useCallback(
		async (type: StorageConnectorType) => {
			const existing = connectors.find((c) => c.type === type)
			if (!existing) return

			const updated: StorageConnectorState = {
				...existing,
				status: 'disconnected',
				lastValidatedAt: new Date().toISOString()
			}
			await persist(updated)
		},
		[connectors, persist]
	)

	const removeConnector = useCallback(async (type: StorageConnectorType) => {
		try {
			const res = await fetch(`/api/storage/connectors?type=${type}`, {
				method: 'DELETE'
			})
			if (!res.ok) {
				throw new Error('Failed to delete connector')
			}
			setConnectors((prev) => prev.filter((c) => c.type !== type))
		} catch (error) {
			console.error('Failed to remove connector:', error)
			throw error
		}
	}, [])

	const connectWithOAuth2 = useCallback(
		async (
			type: StorageConnectorType,
			name: string,
			config: Record<string, string>,
			oauth2Tokens: OAuth2Tokens
		) => {
			const definition = definitionsMap[type]
			if (!definition) throw new Error(`Unknown connector: ${type}`)

			const existing = connectors.find((c) => c.type === type)
			const now = new Date().toISOString()

			const updated: StorageConnectorState = {
				id: existing?.id ?? generateConnectorId(type),
				type,
				name: name || definition.label,
				status: 'configured',
				lastValidatedAt: now,
				lastError: null,
				config: normalizeConfig(definition, config),
				oauth2Tokens
			}

			await persist(updated)
			return updated
		},
		[connectors, definitionsMap, persist]
	)

	return {
		definitions,
		connectors,
		loading,
		testingConnector,
		saveConnector,
		testConnector,
		disconnectConnector,
		removeConnector,
		connectWithOAuth2
	}
}
