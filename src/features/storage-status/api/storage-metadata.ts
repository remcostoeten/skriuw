/**
 * Storage Key Metadata
 *
 * Maps storage keys to their usage in the codebase.
 * This helps developers understand where data is being used.
 *
 * To add a new storage key mapping:
 * 1. Add an entry to STORAGE_KEY_METADATA
 * 2. Include the feature name and file paths where it's used
 */

export interface StorageKeyMetadata {
    feature: string
    description: string
    usedIn: string[]
    route?: string
}

export const STORAGE_KEY_METADATA: Record<string, StorageKeyMetadata> = {
    Skriuw_notes: {
        feature: 'Notes',
        description: 'User notes and content',
        usedIn: [
            'src/features/notes/api/queries/get-notes.ts',
            'src/features/notes/api/mutations/create-note.ts',
            'src/pages/NoteEditor.tsx'
        ],
        route: '/notes'
    },
    'quantum-works:shortcuts:custom': {
        feature: 'Shortcuts',
        description: 'Custom keyboard shortcuts',
        usedIn: [
            'src/features/shortcuts/api/queries/get-shortcuts.ts',
            'src/features/shortcuts/global-shortcut-provider.tsx'
        ],
        route: '/settings/shortcuts'
    },
    'app:settings': {
        feature: 'Settings',
        description: 'Application settings and preferences',
        usedIn: [
            'src/features/settings/api/queries/get-settings.ts',
            'src/features/settings/components/SettingsGroup.tsx'
        ],
        route: '/settings'
    }
}

/**
 * Get metadata for a storage key
 */
export function getStorageKeyMetadata(key: string): StorageKeyMetadata | null {
    return STORAGE_KEY_METADATA[key] || null
}

/**
 * Check if a storage key has metadata
 */
export function hasMetadata(key: string): boolean {
    return key in STORAGE_KEY_METADATA
}
