# Settings

This document lists all settings that are **actually implemented and functional** in the application.

## Appearance Settings

### `theme`
- **Type**: `string` (enum: `'dark'` | `'light'` | `'system'`)
- **Default**: `'dark'`
- **Description**: Controls the application theme. When set to `'system'`, follows the system preference.
- **Status**: ✅ Working - Applied to document root element in `settings-provider.tsx`

### `centeredLayout`
- **Type**: `boolean`
- **Default**: `false`
- **Description**: Center the editor content with a max-width container for better readability.
- **Status**: ✅ Working - Used in `editor-wrapper.tsx` to apply centered layout class

### `titleDisplayMode`
- **Type**: `enum` (`'filename'` | `'firstHeading'` | `'aiGenerated'`)
- **Default**: `'filename'`
- **Description**: Controls how the title in the top bar should be displayed.
- **Status**: ✅ Working - Used in `app-layout-container.tsx` to compute title

## Editor Settings

### `wordWrap`
- **Type**: `boolean`
- **Default**: `true`
- **Description**: Enable word wrapping in the editor. When disabled, long lines will require horizontal scrolling.
- **Status**: ✅ Working - Applied to editor via `useEditorConfig` and `editor-wrapper.tsx`

### `blockIndicator`
- **Type**: `boolean`
- **Default**: `true`
- **Description**: Show block indicator (drag handle) on hover, like in Linear or Notion.
- **Status**: ✅ Working - Controls BlockNote's `sideMenu` prop in `default-mode-editor.tsx`

### `showFormattingToolbar`
- **Type**: `boolean`
- **Default**: `true`
- **Description**: Show or hide the formatting toolbar above the editor.
- **Status**: ✅ Working - Controls BlockNote's `formattingToolbar` prop in `default-mode-editor.tsx`

### `placeholder`
- **Type**: `string`
- **Default**: `'Start typing your note...'`
- **Description**: Placeholder text shown in empty editor.
- **Status**: ✅ Working - Passed to editor via `useEditorConfig` and `editor-wrapper.tsx`

### `spellCheck`
- **Type**: `boolean`
- **Default**: `true`
- **Description**: Enable spell checking in the editor.
- **Status**: ✅ Working - Applied to editor attributes in `useEditorConfig.ts`

### `markdownShortcuts`
- **Type**: `boolean`
- **Default**: `true`
- **Description**: Enable markdown keyboard shortcuts (e.g., `**bold**`, `*italic*`).
- **Status**: ✅ Working - Controls `enableInputRules` and `enablePasteRules` in `useEditorConfig.ts`

### `rawMDXMode`
- **Type**: `boolean`
- **Default**: `false`
- **Description**: Use raw MDX editor instead of rich editor. Can be toggled with Ctrl+M.
- **Status**: ✅ Working - Toggles between BlockNote editor and raw MDX textarea

## Behavior Settings

### `autoSave`
- **Type**: `boolean`
- **Default**: `true`
- **Description**: Automatically save notes while typing after a delay.
- **Status**: ✅ Working - Implemented in `use-editor.ts` hook with debounced save logic

### `autoSaveInterval`
- **Type**: `number` (milliseconds)
- **Default**: `30000` (30 seconds)
- **Description**: Auto-save interval in milliseconds (though actual implementation uses `autoSaveDelay` prop).
- **Status**: ⚠️ Exists in defaults but may not be fully used - actual save uses `autoSaveDelay` prop

### `multiNoteTabs`
- **Type**: `boolean`
- **Default**: `false`
- **Description**: Enable multi-note tabs to keep several notes open at once.
- **Status**: ✅ Working - Controls tab functionality in `app-layout-container.tsx`

## Advanced Settings

### `searchInContent`
- **Type**: `boolean`
- **Default**: `false`
- **Description**: When enabled, search will search through all contents of notes in addition to file names.
- **Status**: ✅ Working - Used in `sidebar-component.tsx` to filter notes by content

---

## Settings Not Yet Implemented

The following settings exist in the codebase but are marked as `implemented: false` or are commented out:

- `showLineNumbers` - Show line numbers in the editor
- `fontSize` - Editor font size (small, medium, large, x-large)
- `fontFamily` - Editor font family (inter, mono, serif, sans-serif)
- `lineHeight` - Line height for the editor
- `maxWidth` - Maximum width of the editor
- `focusMode` - Enable focus mode (distraction-free writing)
- `autoFormat` - Automatically format markdown on paste
- `autoBackup` - Automatically backup notes
- `backupInterval` - Backup interval in milliseconds
- `maxBackupFiles` - Maximum number of backup files to keep
- `defaultNoteTemplate` - Default template for new notes
- `sidebarWidth` - Width of the sidebar in pixels

---

## Notes

- Settings are stored in the database under the storage key `"app:settings"` with ID `"app-settings"`
- Settings are loaded on app startup and persisted when changed
- The `SettingsProvider` component manages settings state and applies theme changes immediately
- Settings marked with `implemented: true` in `editor-settings.ts` are guaranteed to be functional
- Some settings exist in `DEFAULT_SETTINGS` but may not be fully wired up in the UI
