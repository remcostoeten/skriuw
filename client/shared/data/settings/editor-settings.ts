import type { UserSetting, SettingsGroup } from "../types";

/**
 * Editor-specific user settings
 */
export const EDITOR_SETTINGS: UserSetting[] = [
  // Editor Behavior
  {
    key: 'wordWrap',
    value: true,
    defaultValue: true,
    type: 'boolean',
    description: 'Enable word wrapping in the editor',
    category: 'editor',
  },
  {
    key: 'autoSave',
    value: true,
    defaultValue: true,
    type: 'boolean',
    description: 'Automatically save notes while typing',
    category: 'behavior',
  },
  {
    key: 'autoSaveInterval',
    value: 30000,
    defaultValue: 30000,
    type: 'number',
    description: 'Auto-save interval in milliseconds',
    category: 'behavior',
    validation: (value: number) => value >= 5000 || 'Auto-save interval must be at least 5 seconds',
  },
  {
    key: 'spellCheck',
    value: true,
    defaultValue: true,
    type: 'boolean',
    description: 'Enable spell checking',
    category: 'editor',
  },
  {
    key: 'showLineNumbers',
    value: false,
    defaultValue: false,
    type: 'boolean',
    description: 'Show line numbers in the editor',
    category: 'editor',
  },

  // Editor Appearance
  {
    key: 'fontSize',
    value: 'medium',
    defaultValue: 'medium',
    type: 'enum',
    description: 'Editor font size',
    category: 'appearance',
    options: ['small', 'medium', 'large', 'x-large'],
  },
  {
    key: 'fontFamily',
    value: 'inter',
    defaultValue: 'inter',
    type: 'enum',
    description: 'Editor font family',
    category: 'appearance',
    options: ['inter', 'mono', 'serif', 'sans-serif'],
  },
  {
    key: 'lineHeight',
    value: 1.6,
    defaultValue: 1.6,
    type: 'number',
    description: 'Line height for the editor',
    category: 'appearance',
    validation: (value: number) => (value >= 1.0 && value <= 3.0) || 'Line height must be between 1.0 and 3.0',
  },
  {
    key: 'maxWidth',
    value: 'full',
    defaultValue: 'full',
    type: 'enum',
    description: 'Maximum width of the editor',
    category: 'appearance',
    options: ['narrow', 'medium', 'wide', 'full'],
  },

  // Editor Features
  {
    key: 'markdownShortcuts',
    value: true,
    defaultValue: true,
    type: 'boolean',
    description: 'Enable markdown keyboard shortcuts',
    category: 'editor',
  },
  {
    key: 'autoComplete',
    value: true,
    defaultValue: true,
    type: 'boolean',
    description: 'Enable auto-complete for markdown',
    category: 'editor',
  },
  {
    key: 'autoFormat',
    value: false,
    defaultValue: false,
    type: 'boolean',
    description: 'Automatically format markdown on paste',
    category: 'editor',
  },
  {
    key: 'previewPanel',
    value: true,
    defaultValue: true,
    type: 'boolean',
    description: 'Show preview panel for markdown',
    category: 'appearance',
  },
  {
    key: 'focusMode',
    value: false,
    defaultValue: false,
    type: 'boolean',
    description: 'Enable focus mode (distraction-free writing)',
    category: 'editor',
  },

  // Tabs and Indentation
  {
    key: 'tabSize',
    value: 4,
    defaultValue: 4,
    type: 'enum',
    description: 'Number of spaces per tab',
    category: 'editor',
    options: [2, 4, 8],
  },
  {
    key: 'useTabs',
    value: false,
    defaultValue: false,
    type: 'boolean',
    description: 'Use tabs instead of spaces',
    category: 'editor',
  },

  // Cursor and Selection
  {
    key: 'cursorBlink',
    value: true,
    defaultValue: true,
    type: 'boolean',
    description: 'Enable cursor blinking',
    category: 'editor',
  },
  {
    key: 'highlightCurrentLine',
    value: true,
    defaultValue: true,
    type: 'boolean',
    description: 'Highlight the current line',
    category: 'editor',
  },
  {
    key: 'matchBrackets',
    value: true,
    defaultValue: true,
    type: 'boolean',
    description: 'Highlight matching brackets',
    category: 'editor',
  },
];

/**
 * Editor settings grouped by category
 */
export const EDITOR_SETTINGS_GROUPS: SettingsGroup[] = [
  {
    category: 'editor',
    title: 'Editor',
    description: 'Editor behavior and editing preferences',
    settings: EDITOR_SETTINGS.filter(s => s.category === 'editor'),
  },
  {
    category: 'appearance',
    title: 'Appearance',
    description: 'Editor appearance and display settings',
    settings: EDITOR_SETTINGS.filter(s => s.category === 'appearance'),
  },
  {
    category: 'behavior',
    title: 'Behavior',
    description: 'Editor behavior and automation settings',
    settings: EDITOR_SETTINGS.filter(s => s.category === 'behavior'),
  },
];

/**
 * Default editor settings values
 */
export const DEFAULT_EDITOR_SETTINGS = EDITOR_SETTINGS.reduce((acc, setting) => {
  acc[setting.key] = setting.defaultValue;
  return acc;
}, {} as Record<string, any>);

/**
 * Get editor settings as UserSetting objects
 */
export function getEditorSettings(settings: Record<string, any>): UserSetting[] {
  return EDITOR_SETTINGS.map(setting => ({
    ...setting,
    value: settings[setting.key] ?? setting.defaultValue,
  }));
}

/**
 * Validate editor setting value
 */
export function validateEditorSetting(key: string, value: any): boolean | string {
  const setting = EDITOR_SETTINGS.find(s => s.key === key);
  if (!setting) return 'Unknown setting';

  // Type validation
  if (setting.type === 'boolean' && typeof value !== 'boolean') {
    return 'Value must be a boolean';
  }
  if (setting.type === 'number' && typeof value !== 'number') {
    return 'Value must be a number';
  }
  if (setting.type === 'string' && typeof value !== 'string') {
    return 'Value must be a string';
  }
  if (setting.type === 'enum' && !setting.options?.includes(value)) {
    return `Value must be one of: ${setting.options?.join(', ')}`;
  }

  // Custom validation
  if (setting.validation) {
    return setting.validation(value);
  }

  return true;
}