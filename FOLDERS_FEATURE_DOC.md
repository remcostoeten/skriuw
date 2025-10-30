# Folders Feature - Internal Documentation

## Overview

The folders feature allows users to organize notes hierarchically using a folder tree structure, similar to file explorers. Currently implemented for **InstantDB only**; Turso implementation pending.

## Current Implementation (InstantDB)

### Schema

**Entities:**
- `folders` - Main folder entity with:
  - `name: string` - Folder display name
  - `createdAt: number` - Creation timestamp
  - `updatedAt: number` - Last update timestamp
  - `deletedAt?: number` - Soft delete timestamp (optional)

**Relations:**
- `parentFolders` - Self-referential relation for folder nesting
  - Forward: `folders → folders` (one parent per folder)
  - Reverse: `folders → folders` (many children per folder)
- `folderNotes` - Links notes to folders
  - Forward: `notes → folders` (one folder per note)
  - Reverse: `folders → notes` (many notes per folder)

### API Layer

**Queries:**
- `modules/folders/api/queries/get-folders.ts`
  - `useGetFolders()` - Fetches all folders, sorted by name

**Mutations:**
- `modules/folders/api/mutations/create.ts`
  - `useCreateFolder()` - Creates folder with auto-naming ("Folder", "Folder (1)", etc.)
  - Supports optional `parentId` for nesting
  
- `modules/folders/api/mutations/update.ts`
  - `useUpdateFolder()` - Updates folder name or parent relationship
  
- `modules/folders/api/mutations/destroy.ts`
  - `useDestroyFolder()` - Soft deletes folder (sets `deletedAt`)

### UI Components

**Sidebar Folder Item:**
- `components/sidebar-folder-item.tsx`
  - Recursive component for rendering folder tree
  - Features:
    - ✅ Toggle open/close state
    - ✅ Inline rename on double-click
    - ✅ Click anywhere else to toggle
    - ✅ Shows child folders and notes
    - ✅ Visual folder icons (open/closed)

**Notes View Integration:**
- `views/notes-view.tsx`
  - Root folder button in sidebar header
  - Renders root folders and orphan notes
  - Filters deleted folders

### Features Implemented

✅ **Folder Creation**
- Auto-naming: "Folder", "Folder (1)", "Folder (2)", etc.
- Default to root level (no parent)

✅ **Folder Renaming**
- Double-click folder name to edit inline
- Enter to save, Escape to cancel
- Auto-saves on blur

✅ **Folder Deletion**
- Soft delete (sets `deletedAt` timestamp)
- Hidden from UI immediately

✅ **Hierarchical Display**
- Recursive tree structure
- Open/close state per folder
- Shows child folders and notes
- Visual nesting with indentation

✅ **Note Organization**
- Notes can be assigned to folders
- Orphan notes shown at root level
- Filtering by folder relationship

## What Needs to be Ported to Turso

### 1. Database Schema
- Add `folders` table with columns:
  ```sql
  CREATE TABLE folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id TEXT REFERENCES folders(id),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  );
  ```
- Add `parent_id` foreign key to `folders` table
- Add `folder_id` foreign key to `notes` table

### 2. Drizzle Schema
- Update `apps/turso/src/lib/db/schema.ts`
- Add `folders` table definition
- Add relations: `parentId` → `folders.id`, `folderId` → `folders.id`

### 3. API Layer
- **Queries:**
  - `modules/folders/api/queries/get-folders.ts`
    - Use Drizzle `select` with recursive CTE or multiple queries
    - Return flat list or hierarchical structure

- **Mutations:**
  - `modules/folders/api/mutations/create-folder.ts`
    - Drizzle `insert` with auto-naming logic
    - Set `parent_id` foreign key
    
  - `modules/folders/api/mutations/update-folder.ts`
    - Drizzle `update` for name and `parent_id`
    
  - `modules/folders/api/mutations/delete-folder.ts`
    - Soft delete: `update` with `deleted_at` timestamp

### 4. UI Components
- Copy `components/sidebar-folder-item.tsx` to `apps/turso/src/components/`
- Update imports to use Turso API hooks
- Integrate into `apps/turso/src/views/notes-view.tsx`
- Add folder creation button

### 5. Migration Script
- Create migration to add `folders` table
- Add `folder_id` column to `notes` table
- Migrate existing data if needed

## Drag-and-Drop Implementation (In Progress)

### Planned Features
- ✅ Native HTML5 drag-and-drop API
- ✅ Visual drag feedback
- ✅ Drop zones on folders
- ✅ Move folders before/after other folders
- ✅ Nest folders by dropping into folder
- ✅ Smooth animations
- ✅ Prevent invalid drops (self into self, etc.)

### Implementation Details
- Use `draggable="true"` on folder items
- Use `dragstart`, `dragover`, `drop` events
- Use `insertBefore()` or `insertAdjacentElement()` for DOM updates
- Optimistic UI updates
- Sync to database via API

## Technical Notes

### InstantDB Transaction Pattern
```typescript
// Correct pattern:
await transact([tx.folders[id].update(data)]);
await transact([tx.parentFolders.connect({ from, to })]);

// Incorrect pattern (will error):
await transact(tx.folders[id].insert()); // ❌
```

### BubbleMenu Import
```typescript
// Correct:
import { BubbleMenu } from '@tiptap/react/menus';

// Incorrect:
import { BubbleMenu } from '@tiptap/react'; // ❌
```

### Folder Naming Logic
```typescript
function nextDefaultFolderName(existing: string[]): string {
  const base = 'Folder';
  if (!existing.includes(base)) return base;
  let i = 1;
  while (existing.includes(`${base} (${i})`)) i++;
  return `${base} (${i})`;
}
```

## Future Enhancements

- [ ] Drag-and-drop notes into folders
- [ ] Bulk folder operations
- [ ] Folder search/filter
- [ ] Folder colors/tags
- [ ] Keyboard shortcuts for folder navigation
- [ ] Folder templates
- [ ] Export folder structure

## References

- InstantDB Schema: `apps/instantdb/lib/db/schema.ts`
- Folder Components: `apps/instantdb/components/sidebar-folder-item.tsx`
- API Mutations: `apps/instantdb/modules/folders/api/mutations/`
- Notes View: `apps/instantdb/views/notes-view.tsx`

---

**Last Updated:** Current Date
**Status:** ✅ Implemented (InstantDB), ⏳ Pending (Turso), 🚧 In Progress (Drag-and-Drop)

