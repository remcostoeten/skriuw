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
		
		// Dev event tracking (only in browser environment)
		if (typeof window !== 'undefined' && import.meta.env?.DEV) {
			try {
				const { devEventTracker } = await import('../../../../apps/web/src/shared/dev/dev-event-tracker');
				devEventTracker.log({
					type: 'mutation',
					operation: 'create',
					storageKey,
					data: result
				});
			} catch {
				// Ignore if dev-event-tracker is not available
			}
		}
		
		return result;
	} catch (error) {
		// Dev event tracking (only in browser environment)
		if (typeof window !== 'undefined' && import.meta.env?.DEV) {
			try {
				const { devEventTracker } = await import('../../../../apps/web/src/shared/dev/dev-event-tracker');
				devEventTracker.log({
					type: 'mutation',
					operation: 'create',
					storageKey,
					error: error instanceof Error ? error.message : String(error)
				});
			} catch {
				// Ignore if dev-event-tracker is not available
			}
		}
		
		throw new Error(`Failed to create entity in ${storageKey}: ${error instanceof Error ? error.message : String(error)}`);
	}
}