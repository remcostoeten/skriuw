# Database Schema Explanation

## Current Tables

### Core Tables (Actually Used)
1. **`notes`** - The main note documents
   - Stores note content as JSONB (BlockNote format)
   - Links to folders for organization
   - Used by: All note features

2. **`folders`** - Hierarchical folder structure
   - Supports nested folders (parent-child relationship)
   - Used by: All note features

3. **`generic_storage`** - Key-value storage table
   - **Purpose:** Stores settings, keyboard shortcuts, and other app configuration
   - **Structure:** Simple key-value pairs where value is JSONB
   - **Storage Keys Used:**
     - `app:settings` - Application settings (markdown shortcuts, feature flags, etc.)
     - `quantum-works:shortcuts:custom` - Custom keyboard shortcut mappings
   - **Used by:** Settings feature, Shortcuts feature
   - **Status:** ✅ Actively used

### Unused/Planned Tables (Not Currently Used)
4. **`profiles`** - User profiles
   - **Purpose:** For multi-user collaboration/attribution
   - **Status:** Defined but not used in current codebase
   - **Fields:** displayName, email, avatarUrl
   - **Can remove if:** You don't need user profiles/collaboration

5. **`devices`** - Device tracking
   - **Purpose:** Track devices for multi-device sync
   - **Status:** Defined but not used in current codebase
   - **Fields:** profileId, label, lastSeenAt
   - **Can remove if:** You don't need device tracking/sync

6. **`note_revisions`** - Note history/versioning
   - **Purpose:** Store snapshots of note content for undo/history
   - **Status:** Partially implemented - revisions are created when notes update, but no UI to view/restore them
   - **Fields:** noteId, label, snapshot (JSONB), createdAt
   - **Can remove if:** You don't need note history/undo functionality

## Recommendations

### Minimal Schema (Just Core Features)
If you only need notes and folders:
- Keep: `notes`, `folders`, `generic_storage`
- Remove: `profiles`, `devices`, `note_revisions`

### With History (Keep Revisions)
If you want note history/undo:
- Keep: `notes`, `folders`, `generic_storage`, `note_revisions`
- Remove: `profiles`, `devices`

### Full Schema (Future Collaboration)
If you plan to add collaboration later:
- Keep everything

## Current Usage

Based on code analysis:
- ✅ **notes** - Actively used
- ✅ **folders** - Actively used  
- ✅ **generic_storage** - Used for settings/shortcuts
- ⚠️ **note_revisions** - Created but not displayed/used
- ❌ **profiles** - Not used anywhere
- ❌ **devices** - Not used anywhere

