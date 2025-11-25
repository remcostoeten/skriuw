import { getGenericStorage } from "@/api/storage/generic-storage-factory";

/**
 * Known project storage keys - used to filter localStorage
 */
const PROJECT_STORAGE_KEYS = [
	"Skriuw_notes",
	"quantum-works:shortcuts:custom",
	"app:settings",
	"storage.preference",
	"skriuw_editor_tabs_state",
	"Skriuw_expanded_folders",
] as const;

/**
 * Check if a localStorage key belongs to the project
 */
function isProjectStorageKey(key: string): boolean {
	// Check exact matches
	if (PROJECT_STORAGE_KEYS.includes(key as typeof PROJECT_STORAGE_KEYS[number])) {
		return true;
	}
	
	// Check for project-specific prefixes/patterns
	return (
		key.startsWith('Skriuw_') ||
		key.startsWith('skriuw_') ||
		key.startsWith('quantum-works:') ||
		key.startsWith('app:') ||
		key.startsWith('storage.')
	);
}

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
			"storage.preference",
			"skriuw_editor_tabs_state",
			"Skriuw_expanded_folders",
		];
		
		// Try to get actual keys if adapter supports it
		// For localStorage, we can check localStorage directly but filter to project keys only
		if (storage.name === 'localStorage' && typeof localStorage !== 'undefined') {
			const projectKeys: string[] = [];
			for (let i = 0; i < localStorage.length; i++) {
				const key = localStorage.key(i);
				if (key && isProjectStorageKey(key)) {
					projectKeys.push(key);
				}
			}
			return projectKeys;
		}
		
		return knownKeys;
	} catch (error) {
		console.error('Failed to get storage keys:', error);
		return [];
	}
}



