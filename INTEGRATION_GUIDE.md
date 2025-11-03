# Keyboard Shortcuts Integration Guide

## Quick Start

The keyboard shortcuts system is now fully integrated into your app. Here's how to use it in your components.

## Example: Integrating into Sidebar

Add shortcuts to your sidebar component (`src/components/file-tree/sidebar.tsx`):

```tsx
import { useShortcutListener } from '@/hooks/use-shortcut-manager'

export const Sidebar = ({ onNoteSelect, onNoteCreate, selectedNoteId }: props = {}) => {
  // ... existing state and hooks ...
  
  const [searchOpen, setSearchOpen] = useState(false)
  
  // Add shortcut handlers
  const handleSearchToggle = useCallback(() => {
    setSearchOpen(prev => !prev)
    // Focus search input if opening
    if (!searchOpen) {
      // Your search focus logic
    }
  }, [searchOpen])
  
  const handleToggleAllFolders = useCallback(() => {
    if (openFolders.size > 0) {
      // Collapse all
      setOpenFolders(new Set())
    } else {
      // Expand all
      const allFolderIds = folders.map(f => f.id)
      setOpenFolders(new Set(allFolderIds))
    }
  }, [openFolders, folders])
  
  // Register shortcuts
  useShortcutListener({
    'toggle-search': handleSearchToggle,
    'toggle-folders': handleToggleAllFolders
  })
  
  // ... rest of component ...
}
```

## Example: Adding More Default Shortcuts

Edit `src/lib/shortcuts.ts` to add more shortcuts:

```typescript
export async function setupDefaultShortcuts() {
  const shortcuts = await invoke<ShortcutConfig[]>('get_shortcuts')

  if (shortcuts.length === 0) {
    // Search
    await invoke('create_shortcut', {
      config: {
        id: crypto.randomUUID(),
        key: 'CmdOrCtrl+F',
        action: 'toggle-search',
        enabled: true
      }
    })

    // Folders
    await invoke('create_shortcut', {
      config: {
        id: crypto.randomUUID(),
        key: 'CmdOrCtrl+0',
        action: 'toggle-folders',
        enabled: true
      }
    })

    // New Note
    await invoke('create_shortcut', {
      config: {
        id: crypto.randomUUID(),
        key: 'CmdOrCtrl+N',
        action: 'new-note',
        enabled: true
      }
    })

    // Save Note
    await invoke('create_shortcut', {
      config: {
        id: crypto.randomUUID(),
        key: 'CmdOrCtrl+S',
        action: 'save-note',
        enabled: true
      }
    })

    // Quick Command Palette
    await invoke('create_shortcut', {
      config: {
        id: crypto.randomUUID(),
        key: 'CmdOrCtrl+K',
        action: 'command-palette',
        enabled: true
      }
    })
  }
}
```

## Example: Note Editor Integration

Add shortcuts to your note editor (`src/components/editor/note-editor.tsx`):

```tsx
import { useShortcutListener } from '@/hooks/use-shortcut-manager'

export function NoteEditor() {
  const editor = useEditor(/* ... */)
  
  const handleSave = useCallback(() => {
    // Your save logic
    console.log('Saving note...')
  }, [])
  
  const handleNewNote = useCallback(() => {
    // Your new note logic
    console.log('Creating new note...')
  }, [])
  
  useShortcutListener({
    'save-note': handleSave,
    'new-note': handleNewNote
  })
  
  return (
    // ... your editor JSX ...
  )
}
```

## Example: Building a Shortcuts Settings UI

Create a settings page to manage shortcuts:

```tsx
'use client'

import { useShortcutManager } from '@/hooks/use-shortcut-manager'

export function ShortcutSettings() {
  const { shortcuts, updateShortcut, deleteShortcut } = useShortcutManager()
  
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Keyboard Shortcuts</h1>
      
      <div className="space-y-2">
        {shortcuts.map(shortcut => (
          <div key={shortcut.id} className="flex items-center gap-4 p-3 bg-gray-800 rounded">
            <div className="flex-1">
              <p className="font-semibold">{shortcut.action}</p>
              <kbd className="px-2 py-1 bg-gray-700 rounded text-sm">
                {shortcut.key}
              </kbd>
            </div>
            
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={shortcut.enabled}
                onChange={(e) => updateShortcut(shortcut.id, {
                  ...shortcut,
                  enabled: e.target.checked
                })}
              />
              Enabled
            </label>
            
            <button
              onClick={() => deleteShortcut(shortcut.id)}
              className="px-3 py-1 bg-red-600 rounded hover:bg-red-700"
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
```

## Testing the Implementation

1. **Start the dev server:**
   ```bash
   bun run tauri:dev
   ```

2. **Test default shortcuts:**
   - Press `Cmd/Ctrl + F` - Should trigger 'toggle-search' action
   - Press `Cmd/Ctrl + 0` - Should trigger 'toggle-folders' action

3. **Check the console:**
   - Open DevTools (F12)
   - You should see events when shortcuts are triggered

4. **Verify storage:**
   - Shortcuts are stored in `shortcuts.json`
   - Location varies by OS (see SHORTCUTS_README.md)

## Common Patterns

### Pattern 1: Toggle State
```tsx
const handleToggle = useCallback(() => {
  setState(prev => !prev)
}, [])

useShortcutListener({
  'my-action': handleToggle
})
```

### Pattern 2: Focus Element
```tsx
const inputRef = useRef<HTMLInputElement>(null)

const handleFocus = useCallback(() => {
  inputRef.current?.focus()
}, [])

useShortcutListener({
  'focus-search': handleFocus
})
```

### Pattern 3: Multiple Actions
```tsx
useShortcutListener({
  'action-1': handler1,
  'action-2': handler2,
  'action-3': handler3
})
```

## Troubleshooting

### Shortcuts not working in dev mode?
- Make sure you're running `bun run tauri:dev`, not just `bun run dev`
- Tauri shortcuts only work in the Tauri window, not in the browser

### Action not triggering?
- Check that the action name matches exactly between setup and listener
- Verify the shortcut is enabled in the store
- Check browser console for errors

### Want to disable a shortcut temporarily?
```tsx
const { updateShortcut } = useShortcutManager()

// Disable
await updateShortcut(id, { ...config, enabled: false })

// Enable
await updateShortcut(id, { ...config, enabled: true })
```

## Next Steps

1. Add shortcuts to your main components (Sidebar, Editor, etc.)
2. Create a settings UI for users to customize shortcuts
3. Add more default shortcuts based on your app's features
4. Consider adding visual indicators (e.g., tooltips showing shortcuts)

For complete API documentation, see `SHORTCUTS_README.md`.
