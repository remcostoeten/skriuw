# Feature: Keyboard Shortcuts

## Overview

A centralized keyboard shortcuts system allowing global and context-aware shortcuts with user customization capabilities.

## Changelog

### v0.0.1 (Alpha)

**Initial Implementation**

- Global shortcut provider
- Context-aware shortcut handling
- User customization mechanism
- LocalStorage persistence for custom bindings

## Components

### `GlobalShortcutProvider`
Located in `features/shortcuts/global-shortcut-provider.tsx`. Handles the registration and listening of keypress events globally.

### `useShortcut` Hook
Allows components to register specific actions to shortcuts.
```typescript
useShortcut('save-note', (e) => {
    e.preventDefault()
    saveNote()
})
```

### Definitions
Located in `features/shortcuts/shortcut-definitions.ts`. Defines the default keybindings.

## Storage
Custom keybindings are currently stored in `localStorage`. Future plans include migrating this to the database (`shortcuts` table exists in schema).

## UX
- **Global**: Modifiers (Ctrl/Cmd) work everywhere.
- **Context**: Single keys (like `/`) are disabled inside input fields to prevent typing interference.

## Future Plans
- Migrate storage to PostgreSQL `shortcuts` table.
- Add conflict detection UI.
- Support cloud sync for shortcuts.
