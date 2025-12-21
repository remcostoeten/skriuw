export type KeyCombo = string[]

export type ShortcutDefinition = {
	keys: KeyCombo[]
	description?: string
	enabled?: boolean
}

export const shortcutDefinitions = {
	// ==================== Navigation ====================
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
	'toggle-sidebar': {
		keys: [
			['Ctrl', 'b'],
			['Meta', 'b'],
		],
		description: 'Toggle sidebar visibility',
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
	'open-collection': {
		keys: [
			['Ctrl', 'o'],
			['Meta', 'o'],
		],
		description: 'Open Archive & Collections page',
		enabled: true,
	},

	// ==================== File Operations ====================
	'create-note': {
		keys: [['Ctrl', 'n'], ['Meta', 'n']],
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
		keys: [['Ctrl', 'r'], ['Meta', 'r']],
		description: 'Rename selected file/folder',
		enabled: true,
	},
	'delete-item': {
		keys: [['Delete'], ['Backspace'], ['Ctrl', 'Backspace'], ['Meta', 'Backspace']],
		description: 'Delete selected file/folder when context menu is open',
		enabled: true,
	},
	'pin-item': {
		keys: [['p']],
		description: 'Pin/unpin selected file/folder when context menu is open',
		enabled: true,
	},

	// ==================== Split View ====================
	'split.toggle': {
		keys: [
			['Ctrl', '\\'],
			['Meta', '\\'],
		],
		description: 'Toggle split view',
		enabled: true,
	},
	'split.swap': {
		keys: [
			['Ctrl', 'Shift', '\\'],
			['Meta', 'Shift', '\\'],
		],
		description: 'Swap split panes',
		enabled: true,
	},
	'split.orientation.next': {
		keys: [
			['Ctrl', 'Alt', 'o'],
			['Meta', 'Alt', 'o'],
		],
		description: 'Cycle split orientation (vertical ↔ horizontal)',
		enabled: true,
	},
	'split.focus.left': {
		keys: [
			['Ctrl', 'Alt', 'ArrowLeft'],
			['Meta', 'Alt', 'ArrowLeft'],
		],
		description: 'Focus left pane',
		enabled: true,
	},
	'split.focus.right': {
		keys: [
			['Ctrl', 'Alt', 'ArrowRight'],
			['Meta', 'Alt', 'ArrowRight'],
		],
		description: 'Focus right pane',
		enabled: true,
	},
	'split.close': {
		keys: [
			['Ctrl', 'Alt', 'w'],
			['Meta', 'Alt', 'w'],
		],
		description: 'Close active pane',
		enabled: true,
	},
	'split.cycle': {
		keys: [['`']],
		description: 'Cycle between split panes (clockwise)',
		enabled: true,
	},

	// ==================== Other ====================
	'command-executor': {
		keys: [
			['Ctrl', 'p'],
			['Meta', 'p'],
		],
		description: 'Open command executor',
		enabled: true,
	},
	'toggle-theme': {
		keys: [['Alt', 't']],
		description: 'Toggle theme',
		enabled: true,
	},
} satisfies Record<string, ShortcutDefinition>

export type ShortcutId = keyof typeof shortcutDefinitions
