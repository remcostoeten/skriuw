import type { UserSetting, SettingsGroup } from "@/shared/data/types";

/**
 * Editor-specific user settings
 * Only include settings that are actually implemented and functional
 */
export const EDITOR_SETTINGS: UserSetting[] = [
  // Editor Behavior - Implemented Settings
  {
    key: 'wordWrap',
    value: true,
    defaultValue: true,
    type: 'boolean',
    description: 'Enable word wrapping in the editor',
    category: 'editor',
    implemented: true,
  },
  {
    key: 'blockIndicator',
    value: false,
    defaultValue: false,
    type: 'boolean',
    description: 'Show block indicator (drag handle) on hover, like in Linear or Notion',
    category: 'editor',
    implemented: true,
  },
  {
    key: 'showToolbar',
    value: true,
    defaultValue: true,
    type: 'boolean',
    description: 'Show the main toolbar',
    category: 'editor',
    implemented: true,
  },
  {
    key: 'showFormattingToolbar',
    value: true,
    defaultValue: true,
    type: 'boolean',
    description: 'Show the formatting toolbar',
    category: 'editor',
    implemented: true,
  },
  {
    key: 'autoFocus',
    value: true,
    defaultValue: true,
    type: 'boolean',
    description: 'Automatically focus the editor when opening a note',
    category: 'editor',
    implemented: true,
  },
  {
    key: 'placeholder',
    value: 'Start typing your note...',
    defaultValue: 'Start typing your note...',
    type: 'string',
    description: 'Placeholder text shown in empty editor',
    category: 'editor',
    implemented: true,
  },
  {
    key: 'centeredLayout',
    value: false,
    defaultValue: false,
    type: 'boolean',
    description: 'Center the editor content with a max-width container',
    category: 'appearance',
    implemented: true,
  },
];

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
    settings: EDITOR_SETTINGS.filter(s => s.category === 'editor' && s.implemented !== false),
  },
  // Only include appearance group if there are implemented settings
  ...(EDITOR_SETTINGS.some(s => s.category === 'appearance' && s.implemented !== false) ? [{
    category: 'appearance' as const,
    title: 'Appearance',
    description: 'Editor appearance and display settings',
    settings: EDITOR_SETTINGS.filter(s => s.category === 'appearance' && s.implemented !== false),
  }] : []),
  // Only include behavior group if there are implemented settings
  ...(EDITOR_SETTINGS.some(s => s.category === 'behavior' && s.implemented !== false) ? [{
    category: 'behavior' as const,
    title: 'Behavior',
    description: 'Editor behavior and automation settings',
    settings: EDITOR_SETTINGS.filter(s => s.category === 'behavior' && s.implemented !== false),
  }] : []),
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