import { getGenericStorage } from "../generic-storage-factory";

export interface DestroyOptions {
	recursive?: boolean;
}

/**
 * Generic destroy/delete function that works with any entity type
 * Uses the generic storage adapter for agnostic storage
 */
export async function destroy(storageKey: string, id: string, options?: DestroyOptions): Promise<boolean> {
        try {
                const storage = getGenericStorage();
                const success = await storage.delete(storageKey, id);
                
                // Log to dev tracker
                if (import.meta.env.DEV) {
			const { devEventTracker } = await import('@/shared/dev/dev-event-tracker');
			devEventTracker.log({
				type: 'mutation',
				operation: 'delete',
				storageKey,
				data: { id }
			});
		}
                
                return success;
	} catch (error) {
		// Log error to dev tracker
		if (import.meta.env.DEV) {
			const { devEventTracker } = await import('@/shared/dev/dev-event-tracker');
			devEventTracker.log({
				type: 'mutation',
				operation: 'delete',
				storageKey,
				error: error instanceof Error ? error.message : String(error)
			});
		}
		
		throw new Error(`Failed to delete entity ${id} from ${storageKey}: ${error instanceof Error ? error.message : String(error)}`);
	}
}
