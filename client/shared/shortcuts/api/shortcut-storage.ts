import { ShortcutStorageAPI } from './types';
import { LocalStorageShortcutAdapter } from './local-storage-adapter';

/**
 * Factory function to get the appropriate storage adapter
 * This makes it easy to swap storage backends later
 */
export function createShortcutStorage(): ShortcutStorageAPI {
    // For now, return localStorage adapter
    // Later, you can switch based on environment or configuration:
    // - if (isInstantDB) return new InstantDBShortcutAdapter()
    // - if (isDrizzle) return new DrizzleShortcutAdapter()
    // - etc.
    return new LocalStorageShortcutAdapter();
}

// Singleton instance for the app
let storageInstance: ShortcutStorageAPI | null = null;

export function getShortcutStorage(): ShortcutStorageAPI {
    if (!storageInstance) {
        storageInstance = createShortcutStorage();
    }
    return storageInstance;
}

