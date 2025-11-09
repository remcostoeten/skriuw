# Keyboard Shortcuts Guide

This document explains the complete keyboard shortcut system in Skriuw, including how it works, all available shortcuts, and how to customize them.

## How the Shortcut System Works

### Architecture

The shortcut system uses a centralized, event-driven architecture:

```
User Input → Global Handler → Database Lookup → Event Dispatch → Component Handlers
```

**Key Components:**
- **Database**: All shortcuts stored in Skriuw (`shortcuts` entity)
- **Global Handler**: `useGlobalShortcuts()` listens for all key presses
- **Event System**: Custom events dispatched for loose coupling
- **Component Handlers**: Components listen to events they care about

### Key Features

1. **Database-Backed**: All shortcuts stored in Skriuw, fully customizable
2. **Event-Driven**: Uses custom events for loose coupling between components
3. **Context-Aware**: Shortcuts can be global or context-specific (editor, sidebar, etc.)
4. **Cross-Platform**: Automatically handles Mac (`Cmd`) vs Windows/Linux (`Ctrl`) differences
5. **Smart Prevention**: Prevents shortcuts when typing in input fields (unless modifier keys are pressed)

### How Shortcuts are Processed

1. **Key Press**: User presses a key combination
2. **Global Detection**: `useGlobalShortcuts()` captures the keypress
3. **Database Lookup**: System checks enabled shortcuts in database
4. **Match Check**: Compares key combination against shortcut combos
5. **Event Dispatch**: Dispatches custom event (e.g., `note:create`)
6. **Component Response**: Components listening to that event respond

## All Available Shortcuts

### Navigation & UI

| Shortcut | Action | Description | Global |
|----------|--------|-------------|--------|
| `CmdOrCtrl+F` | `toggle-search` | Toggle search panel | ✅ Yes |
| `CmdOrCtrl+0` | `toggle-folders` | Toggle folders panel | ✅ Yes |
| `Escape` | `clear-selection` | Clear any active selections | ❌ No |

### Note & Folder Management

| Shortcut | Action | Description | Global |
|----------|--------|-------------|--------|
| `CmdOrCtrl+N` | `new-note` | Create a new note | ✅ Yes |
| `CmdOrCtrl+Shift+N` | `new-folder` | Create a new folder | ✅ Yes |
| `CmdOrCtrl+,` | `open-preferences` | Open application settings | ✅ Yes |

### Context Menu Actions

These shortcuts work when items are selected or context menu is open:

| Shortcut | Action | Description | Global |
|----------|--------|-------------|--------|
| `Shift+R` | `context-rename` | Rename selected note or folder | ❌ No |
| `Shift+D` | `context-duplicate` | Duplicate selected item | ❌ No |
| `Shift+P` | `context-pin` | Pin or unpin selected item | ❌ No |
| `Shift+Backspace` | `context-delete` | Delete selected item | ❌ No |

### Text Editor Shortcuts

These shortcuts work when the note editor is focused:

| Shortcut | Action | Description | Global |
|----------|--------|-------------|--------|
| `CmdOrCtrl+B` | `toggle-bold` | Toggle bold text formatting | ❌ No |
| `CmdOrCtrl+I` | `toggle-italic` | Toggle italic text formatting | ❌ No |
| `CmdOrCtrl+U` | `toggle-underline` | Toggle underline text formatting | ❌ No |
| `CmdOrCtrl+K` | `insert-link` | Insert/edit link | ❌ No |

## Event System

The shortcut system uses custom events for communication. Here are all the events:

### Global Events

- `search:toggle` - Toggle search panel
- `folders:toggle` - Toggle folders panel
- `note:create` - Create new note
- `folder:create` - Create new folder
- `preferences:open` - Open preferences/settings

### Context Events

- `context:rename` - Rename selected item
- `context:duplicate` - Duplicate selected item
- `context:pin` - Pin/unpin selected item
- `context:delete` - Delete selected item
- `selection:clear` - Clear selection

### Editor Events

- `editor:toggle-bold` - Toggle bold formatting
- `editor:toggle-italic` - Toggle italic formatting
- `editor:toggle-underline` - Toggle underline formatting
- `editor:insert-link` - Insert link

## Platform Differences

The system automatically handles platform differences:

- **Mac**: `Cmd` key is used for `CmdOrCtrl` shortcuts
- **Windows/Linux**: `Ctrl` key is used for `CmdOrCtrl` shortcuts
- **All platforms**: `Shift`, `Alt`, and `Meta` keys work consistently

The `CmdOrCtrl` notation means:
- On Mac: Uses `Command` (⌘) key
- On Windows/Linux: Uses `Control` (Ctrl) key

## Customization

### How Shortcuts are Stored

All shortcuts are stored in the Skriuw `shortcuts` entity with the following structure:

```typescript
{
  id: string
  action: TShortcutAction  // e.g., 'new-note', 'toggle-search'
  combo: string            // e.g., 'CmdOrCtrl+N'
  description: string      // Human-readable description
  enabled: boolean         // Whether shortcut is active
  global: boolean         // Whether shortcut works globally
  createdAt: number
  updatedAt: number
}
```

### Default Shortcuts

Default shortcuts are automatically created when the app first loads if they don't exist in the database. This ensures all shortcuts are available even in a fresh database.

### Modifying Shortcuts

**Via Database:**
- Directly modify shortcut records in Skriuw
- Change `combo` to remap shortcuts
- Set `enabled: false` to disable shortcuts
- Modify `global` flag to change scope

**Via API (Future):**
- Settings UI for shortcut customization (planned)
- Programmatic modification via shortcut mutations

## Technical Implementation

### Module Structure

```
src/modules/shortcuts/
├── types.ts              # Type definitions (TShortcutAction, etc.)
├── defaults.ts           # Default shortcut configurations
├── hooks.ts              # React hooks (useGlobalShortcuts, useComponentShortcuts)
├── utils.ts              # Utility functions (matchesShortcut, shouldPreventShortcut)
├── provider.tsx          # ShortcutProvider component
├── api/
│   ├── queries/
│   │   └── get-shortcuts.ts      # Database queries
│   └── mutations/
│       ├── create.ts             # Create shortcuts
│       ├── update.ts              # Update shortcuts
│       └── destroy.ts             # Delete shortcuts
└── index.ts              # Module exports
```

### Usage Patterns

**Global Shortcuts (Event-Based):**
```typescript
// Components listen to events dispatched by global handler
useEffect(() => {
  const handleNoteCreate = () => {
    createNewNote()
  }
  window.addEventListener('note:create', handleNoteCreate)
  return () => window.removeEventListener('note:create', handleNoteCreate)
}, [])
```

**Component Shortcuts (Direct Handlers):**
```typescript
// For context-specific shortcuts (like editor formatting)
useComponentShortcuts([
  {
    id: 'toggle-bold',
    handler: () => editor.chain().focus().toggleBold().run()
  }
], { enabled: true })
```

### Shortcut Matching Logic

The system uses smart matching:
- Case-insensitive key matching
- Modifier key detection (Ctrl, Shift, Alt, Meta)
- Platform-aware `CmdOrCtrl` handling
- Prevents shortcuts when typing in inputs (unless modifier pressed)

## Troubleshooting

### Shortcuts Not Working

1. **Check Focus**: Make sure you're not in an input field (unless using modifier keys)
2. **Check Modifiers**: Ensure correct modifier keys are pressed
3. **Check Database**: Verify shortcuts exist and are enabled in database
4. **Check Console**: Look for errors in browser console
5. **Check Events**: Use browser DevTools to see if events are being dispatched

### Common Issues

**Shortcut fires twice:**
- This was fixed! Components now listen to events instead of registering duplicate handlers

**Editor shortcuts don't work:**
- Make sure the note editor is focused
- Check that shortcuts are enabled in database
- Verify TipTap editor is initialized

**Context shortcuts don't work:**
- These only work when context menu is open or item is selected
- Make sure you're not in an input field

## Best Practices

1. **Use Events**: Prefer listening to events over registering duplicate handlers
2. **Check Context**: Context shortcuts only work in specific contexts
3. **Prevent Defaults**: The system automatically prevents browser defaults
4. **Test Cross-Platform**: Verify shortcuts work on Mac, Windows, and Linux

## Future Enhancements

Planned improvements:
- Settings UI for shortcut customization
- Shortcut conflict detection
- Visual shortcut indicator/overlay
- Import/export shortcut configurations
- Per-user shortcut preferences

---

*This document reflects the current state of the keyboard shortcut system. Last updated: ${new Date().toLocaleDateString()}*

