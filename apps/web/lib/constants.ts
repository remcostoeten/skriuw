/**
 * @fileoverview Application Constants
 * @description Centralized constants used across the application
 */

// Zero-session constants
export const ZERO_SESSION_COOKIE = 'skriuw_zero_session'
export const ZERO_SESSION_STORAGE_KEY = 'skriuw_zero_session_id'
export const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365

// Storage keys
export const STORAGE_KEYS = {
	NOTES: 'skriuw:notes',
	FOLDERS: 'skriuw:folders',
	SETTINGS: 'app:settings',
	SHORTCUTS: 'skriuw:shortcuts:custom'
} as const

// Auth-related constants
export const AUTH_EVENTS = {
	IDENTITY_REQUIRED: 'skriuw:identity-required',
	AUTH_REQUIRED: 'skriuw:auth-required',
	SESSION_CHANGED: 'skriuw:session-changed'
} as const

// Zero-session storage prefix
export const ZERO_SESSION_PREFIX = 'zero_session:'

// Nth-request configuration
export const NTH_REQUEST_THRESHOLD = 5
export const POPUP_COOLDOWN_MS = 60 * 60 * 1000 // 1 hour
