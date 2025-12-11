import { useCallback, useMemo, useState } from 'react'

import { useSettingsContext } from '../../settings/settings-provider'
import { STORAGE_CONNECTOR_DEFINITIONS } from '../core/connectors'
import type {
	StorageConnectorDefinition,
	StorageConnectorState,
	StorageConnectorType,
} from '../core/types'
import { validateConnectorConfig } from '../core/validation'

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
		.filter((field) => field.required && !config[field.name]?.trim())
		.map((field) => field.label)
}

export function useStorageConnectors() {
	const { settings, updateSetting } = useSettingsContext()
	const [testingConnector, setTestingConnector] = useState<StorageConnectorType | null>(null)

	const connectors = (settings.storageConnectors as StorageConnectorState[] | undefined) ?? []

	const definitions = STORAGE_CONNECTOR_DEFINITIONS

	const definitionsMap = useMemo(() => {
		return definitions.reduce<Record<StorageConnectorType, StorageConnectorDefinition>>((acc, def) => {
			acc[def.type] = def
			return acc
		}, {} as Record<StorageConnectorType, StorageConnectorDefinition>)
	}, [definitions])

	const persist = useCallback(
		(next: StorageConnectorState[]) => {
			updateSetting('storageConnectors', next)
		},
		[updateSetting]
	)

	const saveConnector = useCallback(
		async (type: StorageConnectorType, name: string, config: Record<string, string>) => {
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
				status: 'connected',
				lastValidatedAt: now,
				lastError: null,
				config: normalizedConfig,
			}

			const nextConnectors = [
				...connectors.filter((connector) => connector.type !== type),
				updated,
			]

			persist(nextConnectors)
			return updated
		},
		[connectors, definitionsMap, persist]
	)

	const testConnector = useCallback(
		async (type: StorageConnectorType, config: Record<string, string>, name?: string) => {
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

				// Simulate a network validation; swap this for a real ping later.
				await new Promise((resolve) => setTimeout(resolve, 500))

				const existing = connectors.find((c) => c.type === type)

				const success: StorageConnectorState = {
					id: existing?.id ?? generateConnectorId(type),
					type,
					name: name || existing?.name || definition.label,
					status: 'connected',
					lastValidatedAt: new Date().toISOString(),
					lastError: null,
					config: normalized,
				}

				persist([
					...connectors.filter((connector) => connector.type !== type),
					success,
				])

				return success
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Failed to validate connector'
				const existing = connectors.find((connector) => connector.type === type)
				const fallback: StorageConnectorState = {
					id: existing?.id ?? generateConnectorId(type),
					type,
					name: name || existing?.name || definitionsMap[type]?.label || type,
					status: 'error',
					lastValidatedAt: existing?.lastValidatedAt,
					lastError: message,
					config: existing?.config ?? {},
				}
				persist([
					...connectors.filter((connector) => connector.type !== type),
					fallback,
				])
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

			persist([
				...connectors.filter((connector) => connector.type !== type),
				updated,
			])
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

	return {
		definitions,
		connectors,
		saveConnector,
		testConnector,
		disconnectConnector,
		removeConnector,
		testingConnector,
	}
}
