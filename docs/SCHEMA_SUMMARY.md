# Database Schema Summary

## All Tables Overview

### ✅ Core Tables (In Use)

1. **`notes`** - Note documents
   - Content stored as JSONB (BlockNote format)
   - Linked to folders for organization
   - Has profileId (for future collaboration)

2. **`folders`** - Folder hierarchy
   - Supports nested folders
   - Parent-child relationships

3. **`generic_storage`** - App configuration storage
   - **Key:** `app:settings` → Application settings (JSONB)
   - **Key:** `quantum-works:shortcuts:custom` → Custom keyboard shortcuts (JSONB)
   - Simple key-value store for any app data

### ⚠️ Partially Used

4. **`note_revisions`** - Note history/versioning
   - **Status:** Revisions are automatically created when notes update
   - **Problem:** No UI to view/restore revisions
   - **Can remove if:** You don't need note history

### ❌ Unused Tables (Not Used Anywhere)

5. **`profiles`** - User profiles
   - **Status:** Defined but never used
   - **Purpose:** Was for collaboration/attribution
   - **Recommendation:** Remove if not planning collaboration features

6. **`devices`** - Device tracking
   - **Status:** Defined but never used
   - **Purpose:** Was for multi-device sync
   - **Recommendation:** Remove if not planning device sync

## Current Data

All tables are empty (fresh database):
- 0 profiles
- 0 devices  
- 0 revisions
- 0 notes (will be created when you use the app)
- 0 folders (will be created when you use the app)
- 0 generic_storage entries (will be created when you save settings/shortcuts)

## Recommendations

### Minimal Schema (Recommended)
Keep only what you actually use:
- ✅ `notes`
- ✅ `folders`
- ✅ `generic_storage`
- ❌ Remove: `profiles`, `devices`, `note_revisions`

### With History
If you want note history:
- ✅ `notes`
- ✅ `folders`
- ✅ `generic_storage`
- ✅ `note_revisions`
- ❌ Remove: `profiles`, `devices`

## Settings & Shortcuts Storage

Both are stored in the `generic_storage` table:

**Settings** (`app:settings` key):
```json
{
  "settings": {
    "markdownShortcuts": true,
    // ... other settings
  }
}
```

**Shortcuts** (`quantum-works:shortcuts:custom` key):
```json
{
  "shortcut-id-1": ["Ctrl", "K"],
  "shortcut-id-2": ["Ctrl", "Shift", "P"],
  // ... more shortcuts
}
```

