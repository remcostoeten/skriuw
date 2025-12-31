/**
 * @fileoverview Application Constants
 * @description Centralized constants used across the application
 */

export const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365

export const STORAGE_KEYS = {
	NOTES: 'skriuw:notes',
	FOLDERS: 'skriuw:folders',
	SETTINGS: 'app:settings',
	SHORTCUTS: 'skriuw:shortcuts:custom'
} as const

export const AUTH_EVENTS = {
	SESSION_CHANGED: 'skriuw:session-changed'
} as const
