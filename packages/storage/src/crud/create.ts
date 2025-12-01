import { getGenericStorage } from "../generic-storage-factory";

import type { BaseEntity } from "../generic-types";

export interface CreateOptions {
	merge?: boolean;
}

/**
 * Generic create function that works with any entity type.
 */
export async function create<T extends BaseEntity>(
	storageKey: string,
	data: Omit<T, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<T> {
        try {
                const storage = getGenericStorage();
		const result = await storage.create<T>(storageKey, data);
		
		if (import.meta.env.DEV) {
			const { devEventTracker } = await import('@/shared/dev/dev-event-tracker');
			devEventTracker.log({
				type: 'mutation',
				operation: 'create',
				storageKey,
				data: result
			});
		}
		
		return result;
	} catch (error) {
		if (import.meta.env.DEV) {
			const { devEventTracker } = await import('@/shared/dev/dev-event-tracker');
			devEventTracker.log({
				type: 'mutation',
				operation: 'create',
				storageKey,
				error: error instanceof Error ? error.message : String(error)
			});
		}
		
		throw new Error(`Failed to create entity in ${storageKey}: ${error instanceof Error ? error.message : String(error)}`);
	}
}