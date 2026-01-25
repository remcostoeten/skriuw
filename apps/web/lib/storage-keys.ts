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

	// Tasks
	TASKS: 'skriuw:tasks',

	// Shortcuts
	SHORTCUTS: 'skriuw:shortcuts',

	// Editor tabs state
	EDITOR_TABS: 'skriuw:editor-tabs',

	// Split view state
	NOTE_SPLIT_VIEW: 'skriuw:noteSplitView:state',

	// AI Provider Config
	AI_PROVIDER_CONFIG: 'skriuw:ai-provider-config',

	// AI Prompt Log
	AI_PROMPT_LOG: 'skriuw:ai-prompt-log',

	// AI API Keys
	AI_API_KEYS: 'skriuw:ai-api-keys'
} as const

// Default entity IDs
export const DEFAULT_IDS = {
	SETTINGS: 'app-settings'
} as const

// Type for storage keys
export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS]
