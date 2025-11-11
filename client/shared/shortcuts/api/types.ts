import { ShortcutId, KeyCombo } from '../shortcut-definitions';

/**
 * Custom shortcut configuration stored per-user
 */
export type CustomShortcut = {
    id: ShortcutId;
    keys: KeyCombo[];
    customizedAt: string; // ISO timestamp
};

/**
 * Storage API interface for shortcuts
 * This abstraction allows easy migration to different storage backends
 */
export interface ShortcutStorageAPI {
    /**
     * Get all custom shortcuts for the current user
     */
    getCustomShortcuts(): Promise<Record<ShortcutId, KeyCombo[]>>;

    /**
     * Save a custom shortcut for a specific action
     */
    saveCustomShortcut(id: ShortcutId, keys: KeyCombo[]): Promise<void>;

    /**
     * Reset a shortcut to its default value
     */
    resetShortcut(id: ShortcutId): Promise<void>;

    /**
     * Reset all shortcuts to defaults
     */
    resetAllShortcuts(): Promise<void>;
}

