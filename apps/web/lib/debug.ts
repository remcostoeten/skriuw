'use client'
/**
 * Unified Debug & Logging System
 *
 * Consolidates all debug/logging functionality into a single system.
 *
 * ## Environment Variables
 *
 * Master switch (enables all):
 *   NEXT_PUBLIC_DEBUG=true|all
 *
 * Specific flags (comma-separated):
 *   NEXT_PUBLIC_DEBUG=auth,shortcuts,network
 *
 * Legacy support (still works):
 *   NEXT_PUBLIC_ENABLE_AUTH_LOGGING=true
 *   NEXT_PUBLIC_ENABLE_SHORTCUT_LOGGING=true
 *   NEXT_PUBLIC_ENABLE_GENERAL_LOGGING=true
 *
 * ## Usage
 *
 * ```ts
 * import { debug, logger } from '@/lib/debug'
 *
 * // Check if feature is enabled
 * if (debug.isEnabled('auth')) { ... }
 *
 * // Get config object
 * const { authDemoMode, networkLogging } = debug.config()
 *
 * // Simple logging
 * debug.log('auth', 'User signed in', { userId })
 *
 * // Styled logging (like old logger)
 * logger.info('auth', 'Session created')
 * logger.warn('shortcuts', 'Duplicate shortcut')
 * logger.error('network', 'Request failed', error)
 * ```
 */

// All available debug flags
export type DebugFlag =
	| 'auth' // Auth operations & demo mode
	| 'shortcuts' // Keyboard shortcuts
	| 'network' // Network requests
	| 'perf' // Performance monitoring
	| 'render' // Component render tracking
	| 'state' // State change logging
	| 'general' // General/misc logging
	| 'all' // Enable everything

// Styling for console output
const styles: Record<string, string> = {
	auth: 'background: #0052cc; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
	shortcuts:
		'background: #8710be; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
	network:
		'background: #00875a; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
	perf: 'background: #ff5630; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
	render: 'background: #36b37e; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
	state: 'background: #6554c0; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
	general:
		'background: #2b303b; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;'
}

const icons: Record<string, string> = {
	auth: '🔐',
	shortcuts: '⌨️',
	network: '🌐',
	perf: '⚡',
	render: '🎨',
	state: '📊',
	general: '📝'
}

// Parse NEXT_PUBLIC_DEBUG env
function parseDebugFlags(): Set<DebugFlag> {
	const debugValue = process.env.NEXT_PUBLIC_DEBUG || ''

	if (!debugValue || debugValue === 'false') {
		return new Set()
	}

	if (debugValue === 'true' || debugValue === 'all') {
		return new Set(['all'] as DebugFlag[])
	}

	const flags = debugValue.split(',').map((f) => f.trim().toLowerCase()) as DebugFlag[]
	return new Set(flags)
}

// Check legacy env vars
function checkLegacyEnv(flag: DebugFlag): boolean {
	switch (flag) {
		case 'auth':
			return process.env.NEXT_PUBLIC_ENABLE_AUTH_LOGGING === 'true'
		case 'shortcuts':
			return process.env.NEXT_PUBLIC_ENABLE_SHORTCUT_LOGGING === 'true'
		case 'general':
			return process.env.NEXT_PUBLIC_ENABLE_GENERAL_LOGGING === 'true'
		default:
			return false
	}
}

const activeFlags = parseDebugFlags()

/**
 * Check if a specific debug flag is enabled
 * Checks both NEXT_PUBLIC_DEBUG and legacy ENABLE_*_LOGGING vars
 */
export function isDebugEnabled(flag: DebugFlag): boolean {
	// Master switch
	if (activeFlags.has('all')) return true
	// Specific flag in NEXT_PUBLIC_DEBUG
	if (activeFlags.has(flag)) return true
	// Legacy env var fallback
	return checkLegacyEnv(flag)
}

/**
 * Get debug configuration object for components
 */
export function getDebugConfig() {
	return {
		/** Enable auth demo mode (buttons show loading but don't execute) - separate from logging! */
		authDemoMode: process.env.NEXT_PUBLIC_AUTH_DEMO_MODE === 'true',
		/** Enable network request logging */
		networkLogging: isDebugEnabled('network'),
		/** Enable performance monitoring */
		perfMonitoring: isDebugEnabled('perf'),
		/** Enable render tracking */
		renderTracking: isDebugEnabled('render'),
		/** Enable state change logging */
		stateLogging: isDebugEnabled('state'),
		/** Enable shortcut logging */
		shortcutLogging: isDebugEnabled('shortcuts'),
		/** Enable general logging */
		generalLogging: isDebugEnabled('general'),
		/** Check if any debug mode is active */
		isDebugActive:
			activeFlags.size > 0 ||
			checkLegacyEnv('auth') ||
			checkLegacyEnv('shortcuts') ||
			checkLegacyEnv('general')
	}
}

/**
 * Simple debug log - only outputs when flag is enabled
 */
export function debugLog(flag: DebugFlag, ...args: unknown[]) {
	if (!isDebugEnabled(flag)) return
	const icon = icons[flag] || '🔧'
	console.log(`${icon} [${flag.toUpperCase()}]`, ...args)
}

/**
 * Styled Logger class - provides styled console output
 */
class Logger {
	private formatMessage(flag: DebugFlag, message: string): [string, string, string] {
		const icon = icons[flag] || '🔧'
		const style = styles[flag] || styles.general
		return [`%c${icon} ${flag.toUpperCase()}`, style, message]
	}

	info(flag: DebugFlag, message: string, ...args: unknown[]) {
		if (!isDebugEnabled(flag)) return
		const [prefix, style, msg] = this.formatMessage(flag, message)
		console.log(prefix, style, msg, ...args)
	}

	warn(flag: DebugFlag, message: string, ...args: unknown[]) {
		if (!isDebugEnabled(flag)) return
		const [prefix, style, msg] = this.formatMessage(flag, message)
		console.warn(prefix, style, msg, ...args)
	}

	error(flag: DebugFlag, message: string, ...args: unknown[]) {
		if (!isDebugEnabled(flag)) return
		const [prefix, style, msg] = this.formatMessage(flag, message)
		console.error(prefix, style, msg, ...args)
	}

	debug(flag: DebugFlag, message: string, ...args: unknown[]) {
		if (!isDebugEnabled(flag)) return
		const [prefix, style, msg] = this.formatMessage(flag, message)
		console.debug(prefix, style, msg, ...args)
	}

	/** Log with timing info */
	time(flag: DebugFlag, label: string) {
		if (!isDebugEnabled(flag)) return
		console.time(`[${flag.toUpperCase()}] ${label}`)
	}

	timeEnd(flag: DebugFlag, label: string) {
		if (!isDebugEnabled(flag)) return
		console.timeEnd(`[${flag.toUpperCase()}] ${label}`)
	}
}

export const logger = new Logger()

// Convenience export
export const debug = {
	isEnabled: isDebugEnabled,
	config: getDebugConfig,
	log: debugLog
}
