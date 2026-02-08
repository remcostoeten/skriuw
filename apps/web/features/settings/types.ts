import type { BaseEntity } from '@skriuw/shared'

export type UserSetting<T = any> = {
	key: string
	label?: string
	value: T
	defaultValue: T
	type: 'string' | 'number' | 'boolean' | 'object' | 'enum'
	description: string
	category: SettingsCategory
	requiresRestart?: boolean
	options?: T[] // For enum type settings
	validation?: (value: T) => boolean | string
	implemented?: boolean // Whether this setting is actually implemented in the app
	disabled?: boolean // Rendered but not interactive
	disabledReason?: string
	condition?: (settings: Record<string, any>) => boolean // Conditionally show setting based on other settings
	subsection?: string // Optional subsection to group settings visually
	preview?: {
		component: string // Key to lookup the preview component in registry
		props?: Record<string, any> // Extra props for the preview component
	}
}

export type SettingsCategory =
	| 'editor'
	| 'appearance'
	| 'behavior'
	| 'shortcuts'
	| 'backup'
	| 'advanced'
	| 'ai'
	| 'tags'
	| 'note-experience'
	| 'daily-notes'

export type SettingsGroup = {
	category: SettingsCategory
	title: string
	description: string
	settings: UserSetting[]
	customComponent?: string
}

export type SettingsConfig = {
	key: string
	defaultValue: any
	type: 'string' | 'number' | 'boolean' | 'object' | 'enum'
	description: string
	category: SettingsCategory
	requiresRestart?: boolean
	options?: any[]
	validation?: (value: any) => boolean | string
}

// Props passed to all preview components
export type PreviewProps<T = any> = {
	value: T
	settingKey: string
	options?: T[]
	allSettings?: Record<string, any>
}

// -----------------------------------------------------------------------------
// Storage Entity Types
// -----------------------------------------------------------------------------

/**
 * Settings entity stored in storage
 */
export type SettingsEntity = {
	id: 'app-settings'
	settings: Record<string, any>
} & BaseEntity
