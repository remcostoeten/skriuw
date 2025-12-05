export type KeyCombo = string[]

export type ShortcutDefinition = {
	keys: KeyCombo[]
	description?: string
	enabled?: boolean // If false, shortcut is disabled and won't be registered
}

export const shortcutDefinitions = {
	'editor-focus': {
		keys: [['/']],
		description: 'Focus the active note editor',
		enabled: true,
	},
	'toggle-shortcuts': {
		keys: [
			['Ctrl', '/'],
			['Meta', '/'],
		],
		description: 'Open shortcuts panel',
		enabled: true,
	},
	'create-note': {
		keys: [
			['Ctrl', 'n'],
			['Meta', 'n'],
		],
		description: 'Create a new note',
		enabled: true,
	},
	'create-folder': {
		keys: [
			['Ctrl', 'f'],
			['Meta', 'f'],
		],
		description: 'Create a new folder',
		enabled: true,
	},
	'rename-item': {
		keys: [
			['Ctrl', 'r'],
			['Meta', 'r'],
		],
		description: 'Rename selected file/folder',
		enabled: true,
	},
	'open-collection': {
		keys: [
			['Ctrl', 'o'],
			['Meta', 'o'],
		],
		description: 'Open Archive & Collections page',
		enabled: true,
	},
	'toggle-sidebar': {
		keys: [
			['Ctrl', 'b'],
			['Meta', 'b'],
		],
		description: 'Toggle sidebar visibility',
		enabled: true,
	},
	'save-note': {
		keys: [
			['Ctrl', 's'],
			['Meta', 's'],
		],
		description: 'Save the current note',
		enabled: false, // Not implemented yet
	},
	'search-notes': {
		keys: [
			['Ctrl', 'k'],
			['Meta', 'k'],
		],
		description: 'Search notes',
		enabled: true,
	},
	'delete-item': {
		keys: [['Delete'], ['Ctrl', 'Backspace'], ['Meta', 'Backspace']],
		description: 'Delete selected file/folder when context menu is open',
		enabled: true,
	},
	'open-settings': {
		keys: [
			['Ctrl', ','],
			['Meta', ','],
		],
		description: 'Open settings',
		enabled: true,
	},
	'toggle-theme': {
		keys: [['Alt', 't']],
		description: 'Toggle theme',
		enabled: true,
	},
} satisfies Record<string, ShortcutDefinition>

export type ShortcutId = keyof typeof shortcutDefinitions
