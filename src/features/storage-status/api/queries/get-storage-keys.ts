import { getAllStorageKeys } from "@/api/storage/simple-storage";

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
 * Uses simple-storage which works with Postgres/Neon and localStorage fallback
 */
export async function getStorageKeys(): Promise<string[]> {
	try {
		// Get keys from simple-storage (tries Postgres first, falls back to localStorage)
		const dbKeys = await getAllStorageKeys();
		
		// Also check localStorage for raw keys that might not be in the database
		const localStorageKeys: string[] = [];
		if (typeof localStorage !== 'undefined') {
			for (let i = 0; i < localStorage.length; i++) {
				const key = localStorage.key(i);
				if (key && isProjectStorageKey(key)) {
					localStorageKeys.push(key);
				}
			}
		}
		
		// Combine and deduplicate
		const allKeys = new Set([...dbKeys, ...localStorageKeys]);
		return Array.from(allKeys);
	} catch (error) {
		console.error('Failed to get storage keys:', error);
		// Fallback to known keys
		return [
			"Skriuw_notes",
			"quantum-works:shortcuts:custom",
			"app:settings",
			"storage.preference",
			"skriuw_editor_tabs_state",
			"Skriuw_expanded_folders",
		];
	}
}



