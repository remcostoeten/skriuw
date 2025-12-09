/**
 * Centralized storage keys for the application
 * All storage keys should be defined here to prevent duplication and inconsistencies
 */

// Notes feature storage keys
export const STORAGE_KEYS = {
    // Notes and Folders
    NOTES: 'skriuw:notes',

    // Settings
    SETTINGS: 'skriuw:settings',

    // Shortcuts
    SHORTCUTS: 'skriuw:shortcuts',

    // Editor tabs state
    EDITOR_TABS: 'skriuw:editor-tabs',
} as const

// Default entity IDs
export const DEFAULT_IDS = {
    SETTINGS: 'app-settings',
} as const

// Type for storage keys
export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS]
