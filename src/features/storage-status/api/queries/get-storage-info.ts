/**
 * Storage information interface
 */
export interface StorageInfo {
	name: string;
	type: string;
	version?: string;
}

/**
 * Get storage information
 * Works with simple-storage (Postgres/Neon with localStorage fallback)
 */
export async function getStorageInfo(): Promise<StorageInfo> {
	try {
		// Return basic info about the storage system
		return {
			name: 'Database',
			type: 'Postgres/Neon with localStorage fallback',
		};
	} catch (error) {
		throw new Error(`Failed to get storage info: ${error instanceof Error ? error.message : String(error)}`);
	}
}



