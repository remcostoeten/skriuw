import {
	useState,
	useEffect,
	useCallback,
	startTransition,
	useDeferredValue,
	useRef
} from 'react'

import { getStorageValue } from '@/api/storage/simple-storage'

import { getStorageKeys } from '../api/queries/get-storage-keys'
import {
	clearStorageEventLog,
	logStorageEvent,
	readStorageEventLog,
	subscribeToStorageEventLogUpdates,
	type StorageEventLogEntry,
	type StorageEventLogPayload,
	type StorageEventSource,
	type StorageEventType
} from '../utils/storage-event-log'

import type { BaseEntity } from '@/shared/types/base-entity'

// Storage event types (kept here as they're specific to storage status feature)
export type StorageEventListener = (event: StorageEvent) => void
export type StorageEvent = {
	storageKey: string
	eventType: 'created' | 'updated' | 'deleted' | 'changed' | 'route' | 'route-error'
	entityId?: string
	description?: string
	timestamp: number
}

// Adapter storage event type (for compatibility)
type AdapterStorageEventType = 'created' | 'updated' | 'deleted'

export interface StorageKeyData {
	key: string
	items: BaseEntity[]
	isExpanded: boolean
}

export interface CategorizedStorage {
	category: string
	keys: StorageKeyData[]
	isExpanded: boolean
}

export interface StorageKeyActivity {
	count: number
	lastEventAt: number
	lastEventType: AdapterStorageEventType | 'changed'
	source: 'adapter' | 'raw' | 'manual'
}

/**
 * Keys that are stored as raw values in localStorage (not through generic storage adapter)
 * These need special handling since they're not arrays of entities
 */
const RAW_LOCALSTORAGE_KEYS = [
	'storage.preference',
	'storage.schemaVersion',
	'skriuw_editor_tabs_state',
	'Skriuw_expanded_folders',
] as const

/**
 * Check if a key is stored as a raw value in localStorage
 */
function isRawLocalStorageKey(key: string): boolean {
	return RAW_LOCALSTORAGE_KEYS.includes(key as typeof RAW_LOCALSTORAGE_KEYS[number])
}

/**
 * Interface for storage data items that extends BaseEntity
 */
interface StorageDataItem extends BaseEntity {
	value: unknown
}

/**
 * Read a raw localStorage value and convert it to a storage data structure
 */
function readRawLocalStorageValue(key: string): StorageDataItem[] {
	if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
		return []
	}

	try {
		const raw = localStorage.getItem(key)
		if (!raw) {
			return []
		}

		const parsed = JSON.parse(raw)
		const staticTimestamp = 0

		// If it's already an array, wrap each item
		if (Array.isArray(parsed)) {
			return parsed.map((item, idx) => ({
				id: `item-${idx}`,
				createdAt: staticTimestamp,
				updatedAt: staticTimestamp,
				...item,
			}))
		}

		// If it's an object, wrap it as a single entity
		if (typeof parsed === 'object' && parsed !== null) {
			return [{
				id: key,
				createdAt: staticTimestamp,
				updatedAt: staticTimestamp,
				value: parsed,
			}]
		}

		// If it's a primitive value, wrap it
		return [{
			id: key,
			createdAt: staticTimestamp,
			updatedAt: staticTimestamp,
			value: parsed,
		}]
	} catch (error) {
		console.warn(`Failed to read raw localStorage value for ${key}:`, error)
		return []
	}
}

/**
 * Non-blocking hook for loading storage data
 * Each storage key loads independently without blocking others
 */
interface ReloadOptions {
	trackActivity?: boolean
	eventMetadata?: {
		type?: StorageEventType
		entityId?: string
		source?: StorageEventSource
		description?: string
	}
	indexHint?: number
}

export function useStorageData(isOpen: boolean) {
	const [storageData, setStorageData] = useState<StorageKeyData[]>([])
	const [isLoading, setIsLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [recentActivity, setRecentActivity] = useState<Record<string, StorageKeyActivity>>({})
	const [eventLog, setEventLog] = useState<StorageEventLogEntry[]>(() => readStorageEventLog())

	const dataSignaturesRef = useRef<Record<string, string>>({})
	const initializedKeysRef = useRef<Set<string>>(new Set())

	// Deferred value for non-blocking updates
	const deferredStorageData = useDeferredValue(storageData)

	const markKeyAsRead = useCallback((key: string) => {
		setRecentActivity((prev) => {
			if (!prev[key]) return prev
			const { [key]: _, ...rest } = prev
			return rest
		})
	}, [])

	useEffect(() => {
		const unsubscribe = subscribeToStorageEventLogUpdates(setEventLog)
		return unsubscribe
	}, [])

	const appendEventLog = useCallback((entry: StorageEventLogPayload) => {
		logStorageEvent(entry)
	}, [])

	const clearEventLog = useCallback(() => {
		clearStorageEventLog()
	}, [])

	const applyKeyUpdate = useCallback((key: string, itemsArray: BaseEntity[], options?: ReloadOptions) => {
		const signature = JSON.stringify(itemsArray ?? [])
		const prevSignature = dataSignaturesRef.current[key]
		const hasInitialized = initializedKeysRef.current.has(key)
		const timestamp = Date.now()

		startTransition(() => {
			setStorageData((prevData) => {
				const newData = [...prevData]
				const targetIndex = options?.indexHint ?? newData.findIndex((d) => d.key === key)
				if (targetIndex === -1) {
					newData.push({
						key,
						items: itemsArray,
						isExpanded: false
					})
					return newData
				}

				newData[targetIndex] = {
					...newData[targetIndex],
					items: itemsArray
				}
				return newData
			})
		})

		dataSignaturesRef.current[key] = signature

		if (!hasInitialized) {
			initializedKeysRef.current.add(key)
			markKeyAsRead(key)
			return
		}

		if (options?.trackActivity === false || prevSignature === signature) {
			return
		}

		const eventType = options?.eventMetadata?.type ?? 'updated'
		const source = options?.eventMetadata?.source ?? 'adapter'

		setRecentActivity((prev) => ({
			...prev,
			[key]: {
				count: (prev[key]?.count ?? 0) + 1,
				lastEventAt: timestamp,
				lastEventType: eventType,
				source
			}
		}))

		appendEventLog({
			timestamp,
			storageKey: key,
			eventType,
			entityId: options?.eventMetadata?.entityId,
			source,
			description: options?.eventMetadata?.description
		})
	}, [appendEventLog, markKeyAsRead])

	const loadStorageData = useCallback(async (options?: { trackActivity?: boolean }) => {
		setIsLoading(true)
		setError(null)

		try {
			const keys = await getStorageKeys()

			// Load each key independently with non-blocking updates
			const initialData: StorageKeyData[] = keys.map((key) => ({
				key,
				items: [],
				isExpanded: false
			}))

			// Set initial structure immediately (prevents layout shift)
			setStorageData(initialData)

			// Load each key's data independently
			keys.forEach(async (key, index) => {
				try {
					let itemsArray: BaseEntity[] = []

					// Handle raw localStorage keys differently
					if (isRawLocalStorageKey(key)) {
						itemsArray = readRawLocalStorageValue(key)
					} else {
						// Use simple storage for other keys
						const items = await getStorageValue<BaseEntity | BaseEntity[]>(key)
						itemsArray = Array.isArray(items)
							? items
							: items
								? [items]
								: []
					}

					// Update this specific key's data without blocking others
					applyKeyUpdate(key, itemsArray, {
						indexHint: index,
						trackActivity: options?.trackActivity ?? false
					})
				} catch (error) {
					console.warn(`Failed to load data for key ${key}:`, error)
					// Continue loading other keys even if one fails
				}
			})

			setIsLoading(false)
		} catch (err) {
			setError(
				err instanceof Error ? err.message : 'Failed to load storage data'
			)
			setIsLoading(false)
		}
	}, [])

	// Function to reload a specific storage key
	const reloadStorageKey = useCallback(async (key: string, options?: ReloadOptions) => {
		try {
			let itemsArray: BaseEntity[] = []

			// Handle raw localStorage keys differently
			if (isRawLocalStorageKey(key)) {
				itemsArray = readRawLocalStorageValue(key)
			} else {
				// Use simple storage for other keys
				const items = await getStorageValue<BaseEntity | BaseEntity[]>(key)
				itemsArray = Array.isArray(items)
					? items
					: items
						? [items]
						: []
			}

			// Update this specific key's data
			applyKeyUpdate(key, itemsArray, {
				trackActivity: options?.trackActivity ?? true,
				eventMetadata: options?.eventMetadata
			})
		} catch (error) {
			console.warn(`Failed to reload data for key ${key}:`, error)
		}
	}, [])

	// Listen to storage events for live updates
	useEffect(() => {
		if (!isOpen) return

		// Note: Storage event listeners are not available with simple-storage
		// We rely on polling and localStorage events for updates

		// Listen to browser localStorage events for raw keys
		const handleStorageChange = (e: StorageEvent) => {
			// Only handle changes to project keys
			if (e.key && isRawLocalStorageKey(e.key)) {
				reloadStorageKey(e.key, {
					trackActivity: true,
					eventMetadata: {
						type: 'updated',
						source: 'raw',
						description: 'Cross-tab localStorage event'
					}
				})
			}
		}

		window.addEventListener('storage', handleStorageChange)

		// Poll for changes to raw localStorage keys (for same-tab updates)
		// The 'storage' event only fires for changes in OTHER tabs/windows
		// So we need to poll for same-tab changes
		const pollInterval = setInterval(() => {
			// Check all raw localStorage keys for changes
			// This is lightweight since we only check keys that exist
			RAW_LOCALSTORAGE_KEYS.forEach((key) => {
				reloadStorageKey(key, {
					trackActivity: true,
					eventMetadata: {
						type: 'updated',
						source: 'raw',
						description: 'Local polling update'
					}
				})
			})
		}, 500) // Poll every 500ms when panel is open

		// Cleanup
		return () => {
			window.removeEventListener('storage', handleStorageChange)
			clearInterval(pollInterval)
		}
	}, [isOpen, reloadStorageKey])

	useEffect(() => {
		if (isOpen) {
			loadStorageData()
		}
	}, [isOpen, loadStorageData])

	return {
		storageData: deferredStorageData,
		isLoading,
		error,
		reload: () => loadStorageData({ trackActivity: false }),
		recentActivity,
		markKeyAsRead,
		eventLog,
		clearEventLog,
		reloadStorageKey
	}
}

/**
 * Categorize storage keys based on patterns
 */
export function categorizeStorageKeys(
	data: StorageKeyData[]
): CategorizedStorage[] {
	const categories: Record<string, StorageKeyData[]> = {
		'Notes & Content': [],
		Settings: [],
		Shortcuts: [],
		Other: []
	}

	data.forEach((item) => {
		if (
			item.key.toLowerCase().includes('note') ||
			item.key.toLowerCase().includes('skriuw')
		) {
			categories['Notes & Content'].push(item)
		} else if (
			item.key.toLowerCase().includes('setting') ||
			item.key.toLowerCase().includes('config')
		) {
			categories['Settings'].push(item)
		} else if (
			item.key.toLowerCase().includes('shortcut') ||
			item.key.toLowerCase().includes('command')
		) {
			categories['Shortcuts'].push(item)
		} else {
			categories['Other'].push(item)
		}
	})

	const result: CategorizedStorage[] = []

	Object.entries(categories).forEach(([category, keys]) => {
		if (keys.length > 0) {
			result.push({
				category,
				keys,
				isExpanded: true
			})
		}
	})

	return result
}
