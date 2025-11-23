import { getGenericStorage } from "@/api/storage/generic-storage-factory";

/**
 * Get all storage keys currently in use
 * This is adapter-specific, so we'll need to implement it per adapter
 * For now, we'll return known storage keys
 */
export async function getStorageKeys(): Promise<string[]> {
	try {
		const storage = getGenericStorage();
		
		// Known storage keys from features
		const knownKeys = [
			"Skriuw_notes",
			"quantum-works:shortcuts:custom",
			"app:settings",
		];
		
		// Try to get actual keys if adapter supports it
		// For localStorage, we can check localStorage directly
		if (storage.name === 'localStorage' && typeof localStorage !== 'undefined') {
			const allKeys: string[] = [];
			for (let i = 0; i < localStorage.length; i++) {
				const key = localStorage.key(i);
				if (key && !key.startsWith('_')) {
					allKeys.push(key);
				}
			}
			return allKeys;
		}
		
		return knownKeys;
	} catch (error) {
		console.error('Failed to get storage keys:', error);
		return [];
	}
}



