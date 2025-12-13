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

## Available Shortcuts

### General
| Shortcut | Keys | Description |
|----------|------|-------------|
| **Create Note** | `Ctrl/Cmd + N` | Create a new note |
| **Create Folder** | `Ctrl/Cmd + F` | Create a new folder |
| **Save Note** | `Ctrl/Cmd + S` | Save the current note |
| **Delete Item** | `Del` / `Backspace` | Delete selected item (context menu open) |
| **Rename Item** | `Ctrl/Cmd + R` | Rename selected item |
| **Pin Item** | `P` | Pin/unpin selected item |
| **Open Collection** | `Ctrl/Cmd + O` | Open Archive & Collections page |
| **Open Settings** | `Ctrl/Cmd + ,` | Open settings |

### Navigation & UI
| Shortcut | Keys | Description |
|----------|------|-------------|
| **Focus Editor** | `/` | Focus the active note editor |
| **Toggle Sidebar** | `Ctrl/Cmd + B` | Toggle sidebar visibility |
| **Toggle Shortcuts** | `Ctrl/Cmd + /` | Open shortcuts panel |
| **Toggle Theme** | `Alt + T` | Toggle dark/light theme |

### Split View Management
| Shortcut | Keys | Description |
|----------|------|-------------|
| **Toggle Split** | `Ctrl/Cmd + \` | Toggle split view on/off |
| **Swap Panes** | `Ctrl/Cmd + Shift + \` | Swap left and right panes |
| **Cycle Panes** | `` ` `` | Cycle focus between panes |
| **Cycle Orientation** | `Ctrl/Cmd + Alt + O` | Switch between vertical/horizontal split |
| **Force Vertical** | `Ctrl/Cmd + Alt + V` | Force vertical split layout |
| **Force Horizontal** | `Ctrl/Cmd + Alt + H` | Force horizontal split layout |
| **Close Active** | `Ctrl/Cmd + Alt + W` | Close the active pane |
| **Focus Left** | `Ctrl/Cmd + Alt + ←` | Focus left pane |
| **Focus Right** | `Ctrl/Cmd + Alt + →` | Focus right pane |

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
