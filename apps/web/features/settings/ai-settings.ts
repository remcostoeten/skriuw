import type { UserSetting, SettingsGroup } from './types'

/**
 * AI-specific user settings
 * Settings for AI features powered by Vercel AI SDK 5
 */
export const AI_SETTINGS: UserSetting[] = [
	{
		key: 'ai.enabled',
		label: 'Enable AI Features',
		value: false,
		defaultValue: false,
		type: 'boolean',
		description: 'Enable AI-powered features such as spellcheck, auto-complete, and more',
	category: 'ai',
	implemented: true,
	disabled: true,
	disabledReason: 'AI features are currently disabled in this build.',
},
{
	key: 'ai.provider',
	label: 'AI Provider',
	value: 'gemini',
		defaultValue: 'gemini',
		type: 'enum',
	description: 'Select the AI provider to use',
	category: 'ai',
	options: ['gemini', 'openrouter'],
	implemented: true,
	disabled: true,
	condition: (settings) => settings['ai.enabled'] === true,
	disabledReason: 'AI features are currently disabled in this build.',
},
{
	key: 'ai.model',
	label: 'Model',
	value: 'gemini-2.0-flash-exp',
		defaultValue: 'gemini-2.0-flash-exp',
		type: 'enum',
	description: 'Select the AI model to use',
	category: 'ai',
	options: ['gemini-2.0-flash-exp', 'gemini-1.5-flash', 'gemini-1.5-pro'],
	implemented: true,
	disabled: true,
	condition: (settings) => settings['ai.enabled'] === true && settings['ai.provider'] === 'gemini',
	disabledReason: 'AI features are currently disabled in this build.',
},
{
	key: 'ai.model',
	label: 'Model',
	value: 'openrouter/anthropic/claude-3-haiku',
		defaultValue: 'openrouter/anthropic/claude-3-haiku',
		type: 'enum',
	description: 'Select the AI model to use',
	category: 'ai',
	options: [
		'openrouter/anthropic/claude-3-haiku',
		'openrouter/anthropic/claude-3-sonnet',
		'openrouter/openai/gpt-4o',
		'openrouter/auto',
	],
	implemented: true,
	disabled: true,
	condition: (settings) => settings['ai.enabled'] === true && settings['ai.provider'] === 'openrouter',
	disabledReason: 'AI features are currently disabled in this build.',
},
{
	key: 'ai.userKey',
	label: 'Custom API Key',
	value: '',
		defaultValue: '',
		type: 'string',
	description: 'Optional custom API key (overrides system keys)',
	category: 'ai',
	implemented: true,
	disabled: true,
	condition: (settings) => settings['ai.enabled'] === true,
	disabledReason: 'AI features are currently disabled in this build.',
},
	{
		key: 'ai.features.spellcheck',
		label: 'AI Spellcheck',
		value: true,
		defaultValue: true,
		type: 'boolean',
		description: 'Enable AI-powered spellcheck and grammar correction',
		category: 'ai',
		implemented: true,
		condition: (settings) => settings['ai.enabled'] === true,
	},
	{
		key: 'ai.features.autoComplete',
		label: 'AI Auto-Complete',
		value: false,
		defaultValue: false,
		type: 'boolean',
		description: 'Enable AI-powered auto-complete suggestions (coming soon)',
		category: 'ai',
		implemented: false,
		condition: (settings) => settings['ai.enabled'] === true,
	},
	{
		key: 'ai.features.summarize',
		label: 'AI Summarization',
		value: false,
		defaultValue: false,
		type: 'boolean',
		description: 'Enable AI-powered text summarization (coming soon)',
		category: 'ai',
		implemented: false,
		condition: (settings) => settings['ai.enabled'] === true,
	},
]

/**
 * AI settings grouped by category
 */
export const AI_SETTINGS_GROUPS: SettingsGroup[] = [
	{
		category: 'ai',
		title: 'AI Features',
		description: 'Configure AI-powered features and providers',
		settings: AI_SETTINGS.filter((s) => s.implemented !== false),
	},
]

/**
 * Default AI settings values
 */
export const DEFAULT_AI_SETTINGS = AI_SETTINGS.reduce(
	(acc, setting) => {
		acc[setting.key] = setting.defaultValue
		return acc
	},
	{} as Record<string, any>
)

/**
 * Get AI settings as UserSetting objects
 */
export function getAiSettings(settings: Record<string, any>): UserSetting[] {
	return AI_SETTINGS.map((setting) => ({
		...setting,
		value: settings[setting.key] ?? setting.defaultValue,
	}))
}

/**
 * Validate AI setting value
 */
export function validateAiSetting(key: string, value: any): boolean | string {
	const setting = AI_SETTINGS.find((s) => s.key === key)
	if (!setting) return 'Unknown setting'

	// Type validation
	if (setting.type === 'boolean' && typeof value !== 'boolean') {
		return 'Value must be a boolean'
	}
	if (setting.type === 'number' && typeof value !== 'number') {
		return 'Value must be a number'
	}
	if (setting.type === 'string' && typeof value !== 'string') {
		return 'Value must be a string'
	}
	if (setting.type === 'enum' && !setting.options?.includes(value)) {
		return `Value must be one of: ${setting.options?.join(', ')}`
	}

	// Custom validation
	if (setting.validation) {
		return setting.validation(value)
	}

	return true
}
