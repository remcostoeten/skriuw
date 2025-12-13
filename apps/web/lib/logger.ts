import { env } from '@skriuw/env/client'

type LogCategory = 'auth' | 'shortcuts' | 'general'

type LogLevel = 'info' | 'warn' | 'error' | 'debug'

interface LoggerConfig {
	enableAuth: boolean
	enableShortcuts: boolean
	enableGeneral: boolean
}

// Default configuration based on environment variables
const config: LoggerConfig = {
	enableAuth: env.NEXT_PUBLIC_ENABLE_AUTH_LOGGING ?? false,
	enableShortcuts: env.NEXT_PUBLIC_ENABLE_SHORTCUT_LOGGING ?? false,
	enableGeneral: env.NEXT_PUBLIC_ENABLE_GENERAL_LOGGING ?? false
}

const styles = {
	auth: 'background: #0052cc; color: white; padding: 2px 4px; border-radius: 2px; font-weight: bold;',
	shortcuts:
		'background: #8710be; color: white; padding: 2px 4px; border-radius: 2px; font-weight: bold;',
	general:
		'background: #2b303b; color: white; padding: 2px 4px; border-radius: 2px; font-weight: bold;'
}

const icons = {
	auth: '🔐',
	shortcuts: '⌨️',
	general: '📝'
}

class Logger {
	private isEnabled(category: LogCategory): boolean {
		switch (category) {
			case 'auth':
				return config.enableAuth
			case 'shortcuts':
				return config.enableShortcuts
			case 'general':
				return config.enableGeneral
			default:
				return false
		}
	}

	private formatMessage(category: LogCategory, message: string): string[] {
		return [
			`%c${icons[category]} [${category.toUpperCase()}]`,
			styles[category],
			message
		]
	}

	info(category: LogCategory, message: string, ...args: any[]) {
		if (!this.isEnabled(category)) return
		const [prefix, style, msg] = this.formatMessage(category, message)
		console.log(prefix, style, msg, ...args)
	}

	warn(category: LogCategory, message: string, ...args: any[]) {
		if (!this.isEnabled(category)) return
		const [prefix, style, msg] = this.formatMessage(category, message)
		console.warn(prefix, style, msg, ...args)
	}

	error(category: LogCategory, message: string, ...args: any[]) {
		// Errors are usually important enough to show regardless of flag,
		// but we can still respect the category flag if strict silence is desired.
		// For now, let's respect the flag to keep console clean.
		if (!this.isEnabled(category)) return
		const [prefix, style, msg] = this.formatMessage(category, message)
		console.error(prefix, style, msg, ...args)
	}

	debug(category: LogCategory, message: string, ...args: any[]) {
		if (!this.isEnabled(category)) return
		const [prefix, style, msg] = this.formatMessage(category, message)
		console.debug(prefix, style, msg, ...args)
	}
}

export const logger = new Logger()
