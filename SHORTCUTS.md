# Keyboard Shortcuts

All keyboard shortcut functionality is in the `modules/shortcuts` module.

## Architecture

```
Components
    ↓
Shortcuts Module
    ↓
InstantDB Database
```

## Usage

### Get shortcuts from database

```typescript
import { useGetShortcuts, useGetEnabledShortcuts } from '@/modules/shortcuts'

const { shortcuts, loading } = useGetShortcuts()
const { shortcuts: enabled } = useGetEnabledShortcuts()
```

### Register shortcuts in a component

```typescript
import { useComponentShortcuts } from '@/modules/shortcuts'

useComponentShortcuts([
  { id: 'toggle-search', handler: () => { /* ... */ } },
  { id: 'new-note', handler: () => { /* ... */ } }
])
```

### Listen to global shortcut events

```typescript
useEffect(() => {
  const handler = () => { /* ... */ }
  window.addEventListener('note:create', handler)
  return () => window.removeEventListener('note:create', handler)
}, [])
```

## Module Structure

- `types.ts` - Type definitions
- `defaults.ts` - Default shortcuts
- `api/queries/get-shortcuts.ts` - Query hooks (useGetShortcuts, useGetEnabledShortcuts, useGetShortcutByAction)
- `api/mutations/create.ts` - Create shortcut mutation
- `api/mutations/update.ts` - Update shortcut mutation
- `api/mutations/destroy.ts` - Delete shortcut mutation
- `hooks.ts` - Component hooks (useGlobalShortcuts, useComponentShortcuts, useModifierKeys)
- `utils.ts` - Utility functions (matchesShortcut, shouldPreventShortcut)
- `provider.tsx` - ShortcutProvider component
