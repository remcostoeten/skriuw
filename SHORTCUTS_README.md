# Keyboard Shortcuts System

Complete implementation of customizable global keyboard shortcuts for Tauri 2.0 + Next.js.

## Features

- ✅ Global keyboard shortcuts that work system-wide
- ✅ Full CRUD operations (Create, Read, Update, Delete)
- ✅ Persistent storage using Tauri Store plugin
- ✅ React hooks for easy integration
- ✅ Default shortcuts pre-configured
- ✅ Type-safe TypeScript implementation

## Architecture

### Backend (Rust)

- **Location**: `src-tauri/src/shortcuts.rs`
- **Capabilities**: `src-tauri/capabilities/default.json`
- **Commands**:
  - `get_shortcuts` - Retrieve all shortcuts
  - `create_shortcut` - Create a new shortcut
  - `update_shortcut` - Update an existing shortcut
  - `delete_shortcut` - Delete a shortcut

### Frontend (React/TypeScript)

- **Hook**: `src/hooks/use-shortcut-manager.ts`
- **Utilities**: `src/lib/shortcuts.ts`
- **Provider**: `src/components/shortcut-provider.tsx`

## Usage

### 1. Listen to Shortcuts in Components

```tsx
import { useShortcutListener } from '@/hooks/use-shortcut-manager'

function MyComponent() {
  const handleSearchToggle = () => {
    // Your search toggle logic
  }

  const handleFoldersToggle = () => {
    // Your folders toggle logic
  }

  // Register shortcuts
  useShortcutListener({
    'toggle-search': handleSearchToggle,
    'toggle-folders': handleFoldersToggle
  })

  return <div>Your component</div>
}
```

### 2. Manage Shortcuts Programmatically

```tsx
import { useShortcutManager } from '@/hooks/use-shortcut-manager'

function ShortcutSettings() {
  const { 
    shortcuts, 
    createShortcut, 
    updateShortcut, 
    deleteShortcut 
  } = useShortcutManager()

  // Create a new shortcut
  const handleCreate = async () => {
    await createShortcut({
      key: 'CmdOrCtrl+K',
      action: 'quick-command',
      enabled: true
    })
  }

  // Update a shortcut
  const handleUpdate = async (id: string) => {
    await updateShortcut(id, {
      id,
      key: 'CmdOrCtrl+Shift+K',
      action: 'quick-command',
      enabled: true
    })
  }

  // Delete a shortcut
  const handleDelete = async (id: string) => {
    await deleteShortcut(id)
  }

  return (
    <div>
      {shortcuts.map(shortcut => (
        <div key={shortcut.id}>
          {shortcut.key} - {shortcut.action}
        </div>
      ))}
    </div>
  )
}
```

### 3. Add Default Shortcuts

Edit `src/lib/shortcuts.ts` to add more default shortcuts:

```typescript
await invoke('create_shortcut', {
  config: {
    id: crypto.randomUUID(),
    key: 'CmdOrCtrl+N',
    action: 'new-note',
    enabled: true
  }
})
```

## Shortcut Key Format

Use the following format for shortcut keys:

- **Modifiers**: `Cmd`, `Ctrl`, `Alt`, `Shift`, `CmdOrCtrl`
- **Keys**: `A-Z`, `0-9`, `F1-F12`, `Space`, `Enter`, etc.
- **Combinations**: Join with `+` (e.g., `CmdOrCtrl+Shift+K`)

### Examples

- `CmdOrCtrl+F` - Search (Cmd on Mac, Ctrl on Windows/Linux)
- `CmdOrCtrl+Shift+P` - Command palette
- `Alt+N` - New item
- `F5` - Refresh

## Default Shortcuts

The following shortcuts are configured by default:

| Shortcut | Action | Description |
|----------|--------|-------------|
| `Cmd/Ctrl + F` | `toggle-search` | Toggle search panel |
| `Cmd/Ctrl + 0` | `toggle-folders` | Toggle folder tree |

## Data Storage

Shortcuts are stored in `shortcuts.json` in the Tauri app data directory:

- **macOS**: `~/Library/Application Support/com.notys.app/`
- **Windows**: `%APPDATA%\com.notys.app\`
- **Linux**: `~/.config/com.notys.app/`

## Type Definitions

```typescript
type ShortcutConfig = {
  id: string          // Unique identifier
  key: string         // Keyboard combination (e.g., "CmdOrCtrl+F")
  action: string      // Action identifier (e.g., "toggle-search")
  enabled: boolean    // Whether the shortcut is active
}
```

## Integration Example

See `src/components/shortcut-example.tsx` for a complete working example.

## Troubleshooting

### Shortcuts not working?

1. Check that the Tauri app is running
2. Verify permissions in `src-tauri/capabilities/default.json`
3. Check browser console for errors
4. Ensure shortcuts don't conflict with system shortcuts

### Can't register a shortcut?

Some key combinations are reserved by the OS and cannot be registered:
- System shortcuts (e.g., `Cmd+Tab` on Mac)
- Accessibility shortcuts
- Window manager shortcuts

## Future Enhancements

- [ ] Shortcut conflict detection
- [ ] UI for managing shortcuts
- [ ] Import/export shortcut configurations
- [ ] Shortcut categories/groups
- [ ] Visual shortcut overlay
