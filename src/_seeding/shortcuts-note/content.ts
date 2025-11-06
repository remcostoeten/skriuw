/**
 * Keyboard Shortcuts Documentation Content
 * This is the rich-text content for the shortcuts documentation note
 */

export const SHORTCUTS_NOTE_CONTENT = `# Keyboard Shortcuts

This document explains how the keyboard shortcut system works and lists all available shortcuts in this note-taking application.

## How the Shortcut System Works

### Architecture

The shortcut system is built with a modular architecture:

\`\`\`
Components → Shortcuts Module → InstantDB Database
\`\`\`

- **Components**: UI elements that register shortcut handlers
- **Shortcuts Module**: Centralized shortcut management system in \`src/modules/shortcuts/\`
- **Database**: Stores customizable shortcut definitions in InstantDB

### Key Features

1. **Customizable**: All shortcuts are stored in the database and can be modified
2. **Context-aware**: Shortcuts can be global or specific to certain contexts
3. **Event-driven**: Uses custom events for loose coupling between components
4. **Cross-platform**: Automatically handles Mac vs Windows/Linux key differences

### How Shortcuts are Processed

1. **Registration**: Components register handlers for specific shortcut actions
2. **Detection**: Global keyboard listener captures all key presses
3. **Matching**: System matches key combinations against database shortcuts
4. **Dispatching**: Triggers appropriate event handlers
5. **Prevention**: Prevents default browser behavior when shortcuts match

## Available Shortcuts

### Navigation & UI

| Shortcut | Action | Description |
|----------|--------|-------------|
| \`CmdOrCtrl+F\` | Toggle Search | Open/close the search panel |
| \`CmdOrCtrl+0\` | Toggle Folders | Expand/collapse the folders panel |
| \`Escape\` | Clear Selection | Clear any active selections |

### Note & Folder Management

| Shortcut | Action | Description |
|----------|--------|-------------|
| \`CmdOrCtrl+N\` | New Note | Create a new note |
| \`CmdOrCtrl+Shift+N\` | New Folder | Create a new folder |
| \`CmdOrCtrl+,\` | Preferences | Open application settings |

### Context Menu Actions

These shortcuts work when items are selected in the file tree:

| Shortcut | Action | Description |
|----------|--------|-------------|
| \`Shift+R\` | Rename | Rename selected note or folder |
| \`Shift+D\` | Duplicate | Duplicate selected note or folder |
| \`Shift+P\` | Pin/Unpin | Pin or unpin selected item |
| \`Shift+Backspace\` | Delete | Delete selected item |

### Debug Shortcuts (Development)

| Shortcut | Action | Description |
|----------|--------|-------------|
| \`CmdOrCtrl+Shift+?\` | Shortcut Help | Show all available shortcuts |
| \`CmdOrCtrl+Shift+D\` | Toggle Debug Mode | Enable/disable debug overlay |

## Platform Differences

The system automatically handles platform differences:

- **Mac**: \`Cmd\` key is used for \`CmdOrCtrl\` shortcuts
- **Windows/Linux**: \`Ctrl\` key is used for \`CmdOrCtrl\` shortcuts
- **All platforms**: \`Shift\`, \`Alt\`, and \`Meta\` keys work consistently

## Customization

Shortcuts are stored in the database and can be customized through:

1. **Database**: Direct modification of shortcut records
2. **Settings UI**: Future settings interface (planned)
3. **API**: Programmatic modification via shortcut mutations

## Technical Implementation

### Module Structure

\`\`\`
src/modules/shortcuts/
├── types.ts              # Type definitions
├── defaults.ts           # Default shortcut configurations
├── hooks.ts              # React hooks for components
├── utils.ts              # Utility functions for matching
├── provider.tsx          # Shortcut system provider
├── api/
│   ├── queries/
│   │   └── get-shortcuts.ts  # Database queries
│   └── mutations/
│       ├── create.ts         # Create shortcuts
│       ├── update.ts         # Update shortcuts
│       └── destroy.ts        # Delete shortcuts
└── index.ts              # Module exports
\`\`\`

### Usage in Components

\`\`\`typescript
import { useComponentShortcuts } from '@/modules/shortcuts'

// Register shortcuts for a component
useComponentShortcuts([
  { id: 'new-note', handler: () => createNewNote() },
  { id: 'toggle-search', handler: () => toggleSearch() }
])
\`\`\`

### Event System

Components listen for custom events:

\`\`\`typescript
useEffect(() => {
  const handleNoteCreate = () => { /* handle note creation */ }
  window.addEventListener('note:create', handleNoteCreate)
  return () => window.removeEventListener('note:create', handleNoteCreate)
}, [])
\`\`\`

## Troubleshooting

### Shortcuts Not Working

1. **Check focus**: Make sure you're not in an input field
2. **Check modifiers**: Ensure correct modifier keys are pressed
3. **Check conflicts**: Use debug mode (\`CmdOrCtrl+Shift+D\`) to see conflicts
4. **Check database**: Verify shortcuts exist and are enabled

### Debug Mode

Enable debug mode to see:
- Current keyboard context
- Active modifier keys
- Shortcut conflicts
- Real-time key recording

Use \`CmdOrCtrl+Shift+D\` to toggle debug mode, or access via \`window.keyboardManager\` in browser console.

---

*This document was generated programmatically and reflects the current state of the keyboard shortcut system.*`;

