# Keyboard Shortcuts

Simple keyboard shortcuts system with user customization.

## Usage

### Register a shortcut handler:
```typescript
import { useShortcut } from '@/shared/shortcuts/use-shortcut';

useShortcut('save-note', (e) => {
  e.preventDefault();
  saveNote();
});
```

### Add new shortcuts:
Edit `shortcut-definitions.ts`:
```typescript
export const shortcutDefinitions = {
  "my-action": {
    keys: [["Ctrl", "k"], ["Meta", "k"]],
    description: "My action",
  },
}
```

## User Customization

- Click ⌨️ icon in toolbar to open shortcuts panel
- Click any shortcut to record new keys
- Custom shortcuts stored in localStorage

## How It Works

- Shortcuts with modifiers (Ctrl/Meta/Alt) work everywhere
- Shortcuts without modifiers (like "/") only work outside editors/inputs
- This keeps Enter, Backspace, etc. working normally in the editor

## Storage Migration

Current: localStorage via `LocalStorageShortcutAdapter`

To migrate to a new backend:
1. Create adapter implementing `ShortcutStorageAPI` in `api/`
2. Update `createShortcutStorage()` in `api/shortcut-storage.ts`

That's it!

