import { getGenericStorage } from "@/api/storage/generic-storage-factory";

import type { StorageInfo } from "@/api/storage/generic-types";

/**
 * Get storage information from the generic storage adapter
 * Works with any storage backend (localStorage, database, etc.)
 */
export async function getStorageInfo(): Promise<StorageInfo> {
	try {
		const storage = getGenericStorage();
		const info = await storage.getStorageInfo();
		return info;
	} catch (error) {
		throw new Error(`Failed to get storage info: ${error instanceof Error ? error.message : String(error)}`);
	}
}



