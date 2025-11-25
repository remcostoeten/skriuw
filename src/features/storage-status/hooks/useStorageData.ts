import {
	useState,
	useEffect,
	useCallback,
	startTransition,
	useDeferredValue
} from 'react'

import { read } from '@/api/storage/crud/read'

import { getStorageKeys } from '../api/queries/get-storage-keys'

import type { BaseEntity } from '@/api/storage/generic-types'

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

/**
 * Non-blocking hook for loading storage data
 * Each storage key loads independently without blocking others
 */
export function useStorageData(isOpen: boolean) {
	const [storageData, setStorageData] = useState<StorageKeyData[]>([])
	const [isLoading, setIsLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	// Deferred value for non-blocking updates
	const deferredStorageData = useDeferredValue(storageData)

	const loadStorageData = useCallback(async () => {
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
					const items = await read<BaseEntity>(key)
					const itemsArray = Array.isArray(items)
						? items
						: items
							? [items]
							: []

					// Update this specific key's data without blocking others
					startTransition(() => {
						setStorageData((prevData) => {
							const newData = [...prevData]
							newData[index] = {
								...newData[index],
								items: itemsArray
							}
							return newData
						})
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

	useEffect(() => {
		if (isOpen) {
			loadStorageData()
		}
	}, [isOpen, loadStorageData])

	return {
		storageData: deferredStorageData,
		isLoading,
		error,
		reload: loadStorageData
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

