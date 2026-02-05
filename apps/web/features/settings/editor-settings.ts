import type { UserSetting, SettingsGroup } from "./types";

/**
 * Editor-specific user settings
 * Only include settings that are actually implemented and functional
 */
export const EDITOR_SETTINGS: UserSetting[] = [
	{
		key: 'wordWrap',
		label: 'Word Wrap',
		value: true,
		defaultValue: true,
		type: 'boolean',
		description: 'Enable word wrapping in the editor',
		category: 'editor',
		implemented: true,
		preview: {
			component: 'word-wrap'
		}
	},
	{
		key: 'blockIndicator',
		label: 'Block Indicator',
		value: true,
		defaultValue: true,
		type: 'boolean',
		description: 'Show block indicator (drag handle) on hover, like in Linear or Notion',
		category: 'editor',
		implemented: true
	},
	{
		key: 'multiNoteTabs',
		label: 'Multi-Note Tabs',
		value: false,
		defaultValue: false,
		type: 'boolean',
		description: 'Enable multi-note tabs to keep several notes open at once',
		category: 'editor',
		implemented: true,
		preview: {
			component: 'multi-tab'
		}
	},
	{
		key: 'rawMDXMode',
		label: 'Raw MDX Mode',
		value: false,
		defaultValue: false,
		type: 'boolean',
		description: 'Use raw MDX editor instead of rich editor (Ctrl+M to toggle)',
		category: 'editor',
		implemented: true
	},
	{
		key: 'showFormattingToolbar',
		label: 'Formatting Toolbar',
		value: true,
		defaultValue: true,
		type: 'boolean',
		description: 'Show the formatting toolbar',
		category: 'editor',
		implemented: true
	},
	{
		key: 'showEditorMetadata',
		label: 'Show Note Metadata',
		value: true,
		defaultValue: true,
		type: 'boolean',
		description: 'Show icon, tags, and dates at the top of the editor',
		category: 'editor',
		implemented: true
	},
	{
		key: 'ui.animations',
		label: 'UI Animations',
		value: true,
		defaultValue: true,
		type: 'boolean',
		description: 'Enable interface transitions and motion effects across the app',
		category: 'appearance',
		implemented: true
	},
	{
		key: 'sidebarHierarchyGuides',
		label: 'Sidebar Hierarchy Guides',
		value: false,
		defaultValue: false,
		type: 'boolean',
		description: 'Show connecting guide lines between folders and notes in the sidebar tree',
		category: 'appearance',
		implemented: true,
		preview: {
			component: 'sidebar-tree-guides'
		}
	},

	{
		key: 'centeredLayout',
		label: 'Centered Layout',
		value: true,
		defaultValue: true,
		type: 'boolean',
		description: 'Center the editor content with a max-width container',
		category: 'appearance',
		implemented: true,
		preview: {
			component: 'layout',
			props: { type: 'centeredLayout' }
		}
	},
	// Disabled typography options (future)
	{
		key: 'fontSize',
		label: 'Font Size',
		value: 'medium',
		defaultValue: 'medium',
		type: 'enum',
		description: 'Editor font size',
		category: 'appearance',
		subsection: 'Typography',
		options: ['small', 'medium', 'large', 'x-large'],
		implemented: true,
		disabled: true,
		disabledReason: 'Coming soon – not wired to the editor yet.',
		preview: {
			component: 'typography',
			props: { type: 'fontSize' }
		}
	},
	{
		key: 'fontFamily',
		label: 'Font Family',
		value: 'inter',
		defaultValue: 'inter',
		type: 'enum',
		description: 'Editor font family',
		category: 'appearance',
		subsection: 'Typography',
		options: ['inter', 'mono', 'serif', 'sans-serif'],
		implemented: true,
		disabled: true,
		disabledReason: 'Coming soon – not wired to the editor yet.',
		preview: {
			component: 'typography',
			props: { type: 'fontFamily' }
		}
	},
	{
		key: 'lineHeight',
		label: 'Line Height',
		value: 1.6,
		defaultValue: 1.6,
		type: 'number',
		description: 'Line height for the editor',
		category: 'appearance',
		subsection: 'Typography',
		validation: (value: number) =>
			(value >= 1.0 && value <= 3.0) || 'Line height must be between 1.0 and 3.0',
		implemented: true,
		disabled: true,
		disabledReason: 'Coming soon – not wired to the editor yet.',
		preview: {
			component: 'typography',
			props: { type: 'lineHeight' }
		}
	},
	{
		key: 'maxWidth',
		label: 'Max Width',
		value: 'full',
		defaultValue: 'full',
		type: 'enum',
		description: 'Maximum width of the editor',
		category: 'appearance',
		options: ['narrow', 'medium', 'wide', 'full'],
		implemented: true,
		condition: (settings) => settings.centeredLayout === true,
		preview: {
			component: 'layout',
			props: { type: 'maxWidth' }
		}
	},
	{
		key: 'editorTheme',
		label: 'Editor Theme',
		value: 'skriuw-dark',
		defaultValue: 'skriuw-dark',
		type: 'enum',
		description: 'Color theme for the MDX code editor',
		category: 'appearance',
		options: [
			'skriuw-dark',
			'github-dark',
			'dracula',
			'one-dark',
			'monokai',
			'vs-dark',
			'vs-light'
		],
		implemented: true,
		preview: {
			component: 'editor-theme'
		}
	},
	{
		key: 'titleDisplayMode',
		label: 'Title Display Mode',
		value: 'filename',
		defaultValue: 'filename',
		type: 'enum',
		description: 'How the title in the top bar should be displayed',
		category: 'appearance',
		options: ['filename', 'firstHeading', 'aiGenerated'],
		implemented: false
	},
	{
		key: 'searchInContent',
		label: 'Search In Content',
		value: false,
		defaultValue: false,
		type: 'boolean',
		description:
			'When this is toggled on, the search will search through all contents of the notes in addition to file names',
		category: 'advanced',
		implemented: true,
		preview: {
			component: 'search'
		}
	},
	// Note Experience Settings
	{
		key: 'noteCreationMode',
		label: 'Default Note Experience',
		value: 'rich',
		defaultValue: 'rich',
		type: 'enum',
		description: "Choose 'Rich' for cover images and icons, or 'Simple' for a minimal text-only experience.",
		category: 'note-experience',
		options: ['rich', 'simple'],
		implemented: true
	},
	{
		key: 'defaultEmoji',
		label: 'Default Emoji',
		value: '',
		defaultValue: '',
		type: 'string',
		description: 'Automatically assign this emoji to new notes. Leave empty for none.',
		category: 'note-experience',
		implemented: true
	},
	{
		key: 'enableCoverImages',
		label: 'Enable Cover Images',
		value: true,
		defaultValue: true,
		type: 'boolean',
		description: 'Allow adding cover images to notes.',
		category: 'note-experience',
		implemented: true
	},
	{
		key: 'titlePlaceholder',
		label: 'Title Placeholder',
		value: 'Untitled Note',
		defaultValue: 'Untitled Note',
		type: 'string',
		description: 'Placeholder text for the note title.',
		category: 'note-experience',
		implemented: true
	},
	{
		key: 'bodyPlaceholder',
		label: 'Body Placeholder',
		value: '',
		defaultValue: '',
		type: 'string',
		description: 'Placeholder text for the empty note body.',
		category: 'note-experience',
		implemented: true
	},
	{
		key: 'defaultNoteTemplate',
		label: 'Default Note Template',
		value: 'empty',
		defaultValue: 'empty',
		type: 'enum',
		description: 'Starting template for new notes.',
		category: 'note-experience',
		options: ['empty', 'h1', 'h2', 'meeting', 'journal', 'project'],
		implemented: true
	},
	{
		key: 'autoIconFromFolder',
		label: 'Auto-inherit Folder Icon',
		value: false,
		defaultValue: false,
		type: 'boolean',
		description: 'New notes automatically inherit their parent folder icon.',
		category: 'note-experience',
		implemented: true
	},
	// Daily Notes Settings
	{
		key: 'enableDailyNotes',
		label: 'Enable Daily Notes',
		value: false,
		defaultValue: false,
		type: 'boolean',
		description: 'Enable the daily notes feature for journaling.',
		category: 'daily-notes',
		implemented: true
	},
	{
		key: 'dailyNoteFormat',
		label: 'Daily Note Title Format',
		value: 'YYYY-MM-DD',
		defaultValue: 'YYYY-MM-DD',
		type: 'enum',
		description: 'How daily note titles are formatted.',
		category: 'daily-notes',
		options: ['YYYY-MM-DD', 'MMM D, YYYY', 'D MMMM YYYY', 'dddd, MMMM D'],
		implemented: true
	},
	{
		key: 'dailyNoteFolder',
		label: 'Daily Notes Folder',
		value: 'Journal',
		defaultValue: 'Journal',
		type: 'string',
		description: 'Folder where daily notes are created.',
		category: 'daily-notes',
		implemented: true
	},
	{
		key: 'dailyNoteTemplate',
		label: 'Daily Note Template',
		value: 'journal',
		defaultValue: 'journal',
		type: 'enum',
		description: 'Template used for new daily notes.',
		category: 'daily-notes',
		options: ['empty', 'journal', 'h1', 'h2'],
		implemented: true
	},
	{
		key: 'autoOpenDailyNote',
		label: 'Auto-open Daily Note',
		value: false,
		defaultValue: false,
		type: 'boolean',
		description: 'Automatically open or create today\'s note on startup.',
		category: 'daily-notes',
		implemented: true
	},
	{
		key: 'dailyNoteEmoji',
		label: 'Daily Note Emoji',
		value: '📅',
		defaultValue: '📅',
		type: 'string',
		description: 'Default emoji for daily notes.',
		category: 'daily-notes',
		implemented: true
	}
]

/**
 * Commented out settings - Not yet implemented
 * Uncomment and mark as implemented: true when ready
 */
/*
// Editor Behavior - Future Settings
{
  key: 'spellCheck',
  value: true,
  defaultValue: true,
  type: 'boolean',
  description: 'Enable spell checking',
  category: 'editor',
  implemented: false,
},
{
  key: 'markdownShortcuts',
  value: true,
  defaultValue: true,
  type: 'boolean',
  description: 'Enable markdown keyboard shortcuts',
  category: 'editor',
  implemented: false,
},
{
  key: 'autoComplete',
  value: true,
  defaultValue: true,
  type: 'boolean',
  description: 'Enable auto-complete for markdown',
  category: 'editor',
  implemented: false,
},

// Editor Appearance - Future Settings
{
  key: 'fontSize',
  value: 'medium',
  defaultValue: 'medium',
  type: 'enum',
  description: 'Editor font size',
  category: 'appearance',
  options: ['small', 'medium', 'large', 'x-large'],
  implemented: false,
},
{
  key: 'fontFamily',
  value: 'inter',
  defaultValue: 'inter',
  type: 'enum',
  description: 'Editor font family',
  category: 'appearance',
  options: ['inter', 'mono', 'serif', 'sans-serif'],
  implemented: false,
},
{
  key: 'lineHeight',
  value: 1.6,
  defaultValue: 1.6,
  type: 'number',
  description: 'Line height for the editor',
  category: 'appearance',
  validation: (value: number) => (value >= 1.0 && value <= 3.0) || 'Line height must be between 1.0 and 3.0',
  implemented: false,
},
{
  key: 'maxWidth',
  value: 'full',
  defaultValue: 'full',
  type: 'enum',
  description: 'Maximum width of the editor',
  category: 'appearance',
  options: ['narrow', 'medium', 'wide', 'full'],
  implemented: false,
},
{
  key: 'showLineNumbers',
  value: false,
  defaultValue: false,
  type: 'boolean',
  description: 'Show line numbers in the editor',
  category: 'appearance',
  implemented: false,
},

// Editor Features - Future Settings
{
  key: 'focusMode',
  value: false,
  defaultValue: false,
  type: 'boolean',
  description: 'Enable focus mode (distraction-free writing)',
  category: 'editor',
  implemented: false,
},
{
  key: 'autoFormat',
  value: false,
  defaultValue: false,
  type: 'boolean',
  description: 'Automatically format markdown on paste',
  category: 'editor',
  implemented: false,
},

// Behavior Settings - Future Settings
{
  key: 'autoSave',
  value: true,
  defaultValue: true,
  type: 'boolean',
  description: 'Automatically save notes while typing',
  category: 'behavior',
  implemented: false,
},
{
  key: 'autoSaveInterval',
  value: 30000,
  defaultValue: 30000,
  type: 'number',
  description: 'Auto-save interval in milliseconds',
  category: 'behavior',
  validation: (value: number) => value >= 5000 || 'Auto-save interval must be at least 5 seconds',
  implemented: false,
},
*/

/**
 * Editor settings grouped by category
 * Only show categories that have implemented settings
 */
export const EDITOR_SETTINGS_GROUPS: SettingsGroup[] = [
	{
		category: 'editor',
		title: 'Editor',
		description: 'Editor behavior and editing preferences',
		settings: EDITOR_SETTINGS.filter((s) => s.category === 'editor' && s.implemented !== false)
	},
	{
		category: 'note-experience',
		title: 'Note Experience',
		description: 'Customize the default experience when creating new notes',
		settings: EDITOR_SETTINGS.filter((s) => s.category === 'note-experience' && s.implemented !== false)
	},
	{
		category: 'daily-notes',
		title: 'Daily Notes',
		description: 'Configure your daily journaling workflow',
		settings: EDITOR_SETTINGS.filter((s) => s.category === 'daily-notes' && s.implemented !== false)
	},
	// Only include appearance group if there are implemented settings
	...(EDITOR_SETTINGS.some((s) => s.category === 'appearance' && s.implemented !== false)
		? [
			{
				category: 'appearance' as const,
				title: 'Appearance',
				description: 'Editor appearance and display settings',
				settings: EDITOR_SETTINGS.filter(
					(s) => s.category === 'appearance' && s.implemented !== false
				)
			}
		]
		: []),
	// Only include behavior group if there are implemented settings
	...(EDITOR_SETTINGS.some((s) => s.category === 'behavior' && s.implemented !== false)
		? [
			{
				category: 'behavior' as const,
				title: 'Behavior',
				description: 'Editor behavior and automation settings',
				settings: EDITOR_SETTINGS.filter(
					(s) => s.category === 'behavior' && s.implemented !== false
				)
			}
		]
		: []),
	// Only include advanced group if there are implemented settings
	...(EDITOR_SETTINGS.some((s) => s.category === 'advanced' && s.implemented !== false)
		? [
			{
				category: 'advanced' as const,
				title: 'Advanced',
				description: 'Advanced settings and features',
				settings: EDITOR_SETTINGS.filter(
					(s) => s.category === 'advanced' && s.implemented !== false
				)
			}
		]
		: []),
	{
		category: 'tags' as const,
		title: 'My Tags',
		description: 'Manage your tags, customize colors, and see usage across notes',
		settings: [],
		customComponent: 'tags-settings'
	}
]

/**
 * Default editor settings values
 */
export const DEFAULT_EDITOR_SETTINGS = EDITOR_SETTINGS.reduce(
	(acc, setting) => {
		acc[setting.key] = setting.defaultValue
		return acc
	},
	{} as Record<string, any>
)

/**
 * Get editor settings as UserSetting objects
 */
export function getEditorSettings(settings: Record<string, any>): UserSetting[] {
	return EDITOR_SETTINGS.map((setting) => ({
		...setting,
		value: settings[setting.key] ?? setting.defaultValue
	}))
}

/**
 * Validate editor setting value
 */
export function validateEditorSetting(key: string, value: any): boolean | string {
	const setting = EDITOR_SETTINGS.find((s) => s.key === key)
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
