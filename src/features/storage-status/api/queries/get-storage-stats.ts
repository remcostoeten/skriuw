import { getStorageValue } from "@/api/storage/simple-storage";

import { getStorageKeys } from "./get-storage-keys";

import type { BaseEntity } from "@/shared/types/base-entity";


export interface StorageKeyStats {
	key: string
	itemCount: number
	sizeBytes?: number
}

/**
 * Get statistics for each storage key
 */
export async function getStorageStats(): Promise<StorageKeyStats[]> {
	try {
		const keys = await getStorageKeys();
		
		const stats: StorageKeyStats[] = [];
		
		for (const key of keys) {
			try {
				const items = await getStorageValue<BaseEntity | BaseEntity[]>(key);
				const itemCount = Array.isArray(items) ? items.length : items ? 1 : 0;
				
				// Calculate size if localStorage
				let sizeBytes: number | undefined;
				if (typeof localStorage !== 'undefined') {
					const data = localStorage.getItem(key);
					if (data) {
						sizeBytes = new Blob([data]).size;
					}
				}
				
				stats.push({
					key,
					itemCount,
					sizeBytes,
				});
			} catch (error) {
				// Skip keys that fail to read
				console.warn(`Failed to read stats for key ${key}:`, error);
			}
		}
		
		return stats;
	} catch (error) {
		throw new Error(`Failed to get storage stats: ${error instanceof Error ? error.message : String(error)}`);
	}
}

