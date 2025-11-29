import type { DefaultNote } from '@/features/notes/utils/initialize-defaults'

export const pinAndFavoriteItemsNoteSeed: DefaultNote = {
  name: 'Pin Items to Top & Favorite Notes',
  parentFolderName: 'servo',
  contentMarkdown: `# Pin Items to Top & Favorite Notes Implementation Plan

## Overview

Implement functionality to pin items (notes and folders) to the top of the file tree and mark notes as favorites. These features will help users quickly access frequently used items and organize their workspace more effectively.

## Goals

- Add "Pin to top" option in context menu for notes and folders
- Add "Favorite" option in context menu for notes
- Display pinned items at the top of their parent folder
- Display favorite notes in a dedicated section or with visual indicators
- Persist pin and favorite states in the database
- Support unpinning and unfavoriting items

## Features

### 1. Pin to Top

- Pin notes and folders to the top of their parent folder
- Pinned items appear before unpinned items in the file tree
- Visual indicator (pin icon) for pinned items
- Context menu option: "Pin to top" / "Unpin"
- Support multiple pinned items (sorted by pin order or creation date)

### 2. Favorite Notes

- Mark notes as favorites (folders cannot be favorited)
- Visual indicator (star icon) for favorite notes
- Context menu option: "Add to favorites" / "Remove from favorites"
- Optionally display favorites in a separate section at the top of sidebar
- Quick access to favorite notes

## Database Schema Changes

### Migration Required

Add new columns to \`notes\` and \`folders\` tables:

\`\`\`sql
-- Add pinned column to folders table
ALTER TABLE folders ADD COLUMN pinned INTEGER DEFAULT 0;
-- 0 = not pinned, 1 = pinned
-- Could also use timestamp for pin order

-- Add pinned column to notes table
ALTER TABLE notes ADD COLUMN pinned INTEGER DEFAULT 0;

-- Add favorite column to notes table
ALTER TABLE notes ADD COLUMN favorite INTEGER DEFAULT 0;
-- 0 = not favorite, 1 = favorite

-- Add pinned_at timestamp for ordering pinned items
ALTER TABLE folders ADD COLUMN pinned_at INTEGER;
ALTER TABLE notes ADD COLUMN pinned_at INTEGER;
\`\`\`

### Drizzle Schema Update

\`\`\`typescript
// src/db/schema.ts (or wherever schema is defined)
export const folders = sqliteTable("folders", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  parentFolderId: text("parent_folder_id"),
  pinned: integer("pinned", { mode: "boolean" }).default(false),
  pinnedAt: integer("pinned_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const notes = sqliteTable("notes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  content: text("content").notNull(),
  folderId: text("folder_id"),
  profileId: text("profile_id"),
  pinned: integer("pinned", { mode: "boolean" }).default(false),
  pinnedAt: integer("pinned_at", { mode: "timestamp_ms" }),
  favorite: integer("favorite", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
\`\`\`

## TypeScript Type Updates

### Update Note and Folder Interfaces

\`\`\`typescript
// src/features/notes/types/index.ts
export interface Note {
  id: string;
  name: string;
  content: Block[];
  parentFolderId?: string;
  pinned?: boolean;
  pinnedAt?: number;
  favorite?: boolean;
  createdAt: number;
  updatedAt: number;
  type: 'note';
}

export interface Folder {
  id: string;
  name: string;
  type: 'folder';
  children: (Note | Folder)[];
  parentFolderId?: string;
  pinned?: boolean;
  pinnedAt?: number;
  createdAt: number;
  updatedAt: number;
}
\`\`\`

## Implementation

### 1. Database Operations

#### Create API Functions

\`\`\`
src/features/notes/api/mutations/
├── pin-item.ts          # Pin/unpin item
├── favorite-note.ts     # Favorite/unfavorite note
└── update-item-pin.ts   # Update pin state
\`\`\`

\`\`\`typescript
// src/features/notes/api/mutations/pin-item.ts
export async function pinItem(itemId: string, itemType: 'note' | 'folder', pinned: boolean) {
  const db = getDatabase()
  const table = itemType === 'note' ? notes : folders
  
  await db
    .update(table)
    .set({
      pinned: pinned ? 1 : 0,
      pinnedAt: pinned ? Date.now() : null,
      updatedAt: Date.now()
    })
    .where(eq(table.id, itemId))
}

// src/features/notes/api/mutations/favorite-note.ts
export async function favoriteNote(noteId: string, favorite: boolean) {
  const db = getDatabase()
  
  await db
    .update(notes)
    .set({
      favorite: favorite ? 1 : 0,
      updatedAt: Date.now()
    })
    .where(eq(notes.id, noteId))
}
\`\`\`

### 2. Context Menu Updates

#### Add Menu Items

\`\`\`typescript
// src/components/sidebar/sidebar-component.tsx
<ContextMenuContent>
  {/* Existing items */}
  
  <ContextMenuSeparator />
  
  {/* Pin/Unpin option */}
  <ContextMenuItem
    onClick={(e) => {
      e.stopPropagation();
      handlePinItem(item.id, item.type, !item.pinned);
    }}
  >
    {item.pinned ? (
      <>
        <Unpin className="w-4 h-4 mr-3" />
        Unpin from top
      </>
    ) : (
      <>
        <Pin className="w-4 h-4 mr-3" />
        Pin to top
      </>
    )}
  </ContextMenuItem>
  
  {/* Favorite option (notes only) */}
  {!isFolder && (
    <ContextMenuItem
      onClick={(e) => {
        e.stopPropagation();
        handleFavoriteNote(item.id, !item.favorite);
      }}
    >
      {item.favorite ? (
        <>
          <Star className="w-4 h-4 mr-3 fill-yellow-400 text-yellow-400" />
          Remove from favorites
        </>
      ) : (
        <>
          <Star className="w-4 h-4 mr-3" />
          Add to favorites
        </>
      )}
    </ContextMenuItem>
  )}
</ContextMenuContent>
\`\`\`

### 3. File Tree Sorting

#### Update Sort Logic

\`\`\`typescript
// src/components/sidebar/sidebar-component.tsx
const sortItems = useCallback((items: Item[]): Item[] => {
  return [...items].sort((a, b) => {
    // Pinned items first
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    
    // If both pinned, sort by pinnedAt (most recent first) or creation date
    if (a.pinned && b.pinned) {
      const aPinnedAt = a.pinnedAt || a.createdAt;
      const bPinnedAt = b.pinnedAt || b.createdAt;
      return bPinnedAt - aPinnedAt; // Most recent first
    }
    
    // Unpinned items sorted alphabetically
    return a.name.localeCompare(b.name);
  });
}, []);
\`\`\`

### 4. Visual Indicators

#### Pin Icon

\`\`\`typescript
// In FileTreeItem component
{item.pinned && (
  <Pin className="w-3 h-3 text-muted-foreground/60" />
)}
\`\`\`

#### Favorite Star Icon

\`\`\`typescript
// In FileTreeItem component (notes only)
{!isFolder && item.favorite && (
  <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
)}
\`\`\`

### 5. Favorites Section (Optional)

#### Add Favorites Section to Sidebar

\`\`\`typescript
// src/components/sidebar/sidebar-component.tsx
const favoriteNotes = useMemo(() => {
  const collectFavorites = (items: Item[]): Note[] => {
    const favorites: Note[] = [];
    for (const item of items) {
      if (item.type === 'note' && item.favorite) {
        favorites.push(item);
      }
      if (item.type === 'folder' && item.children) {
        favorites.push(...collectFavorites(item.children));
      }
    }
    return favorites;
  };
  return collectFavorites(items);
}, [items]);

// Render favorites section
{favoriteNotes.length > 0 && (
  <div className="mb-4">
    <h3 className="text-xs font-semibold text-muted-foreground mb-2 px-3">
      Favorites
    </h3>
    {favoriteNotes.map((note) => (
      <FileTreeItem
        key={note.id}
        item={note}
        // ... props
      />
    ))}
  </div>
)}
\`\`\`

### 6. Hooks for Pin/Favorite Operations

#### Create Custom Hooks

\`\`\`typescript
// src/features/notes/hooks/use-pin-item.ts
export function usePinItem() {
  const { items, refreshItems } = useNotes();
  
  const pinItem = useCallback(async (itemId: string, itemType: 'note' | 'folder', pinned: boolean) => {
    await pinItemMutation(itemId, itemType, pinned);
    await refreshItems();
  }, [refreshItems]);
  
  return { pinItem };
}

// src/features/notes/hooks/use-favorite-note.ts
export function useFavoriteNote() {
  const { items, refreshItems } = useNotes();
  
  const favoriteNote = useCallback(async (noteId: string, favorite: boolean) => {
    await favoriteNoteMutation(noteId, favorite);
    await refreshItems();
  }, [refreshItems]);
  
  return { favoriteNote };
}
\`\`\`

## UI/UX Design

### Visual Indicators

- **Pin Icon**: Small pin icon (📌) next to pinned items
- **Star Icon**: Star icon (⭐) for favorite notes, filled when favorited
- **Color Coding**: Subtle background color or border for pinned items
- **Position**: Icons appear before or after item name

### Context Menu Layout

\`\`\`
┌─────────────────────────────┐
│ New note                    │
│ New folder                  │
├─────────────────────────────┤
│ Rename                      │
├─────────────────────────────┤
│ 📌 Pin to top               │  ← New
│ ⭐ Add to favorites         │  ← New (notes only)
├─────────────────────────────┤
│ Delete                      │
└─────────────────────────────┘
\`\`\`

### Sidebar Layout Options

#### Option 1: Inline with Indicators
- Pinned items appear at top of folder with pin icon
- Favorite notes have star icon
- No separate sections

#### Option 2: Separate Favorites Section
- Favorites section at top of sidebar
- Pinned items at top of their folders
- Clear visual separation

## Implementation Phases

### Phase 1: Database & Schema (Week 1)

- [ ] Create database migration for \`pinned\`, \`pinnedAt\`, and \`favorite\` columns
- [ ] Update Drizzle schema definitions
- [ ] Update TypeScript interfaces
- [ ] Test migration on all database targets (SQLite, libSQL, web)

### Phase 2: API & Mutations (Week 1-2)

- [ ] Create \`pinItem\` mutation function
- [ ] Create \`favoriteNote\` mutation function
- [ ] Create hooks (\`usePinItem\`, \`useFavoriteNote\`)
- [ ] Add error handling and validation
- [ ] Write unit tests for mutations

### Phase 3: Context Menu Integration (Week 2)

- [ ] Add "Pin to top" / "Unpin" menu item
- [ ] Add "Add to favorites" / "Remove from favorites" menu item
- [ ] Add icons (Pin, Star) from icon library
- [ ] Handle click events and state updates
- [ ] Update menu item text based on current state

### Phase 4: Visual Indicators (Week 2-3)

- [ ] Add pin icon to pinned items
- [ ] Add star icon to favorite notes
- [ ] Style icons appropriately
- [ ] Ensure icons are accessible
- [ ] Test on mobile and desktop

### Phase 5: Sorting & Display (Week 3)

- [ ] Update sort logic to prioritize pinned items
- [ ] Implement pinned item ordering (by pinnedAt)
- [ ] Test sorting in nested folders
- [ ] Ensure performance with large item lists
- [ ] (Optional) Implement favorites section

### Phase 6: Testing & Polish (Week 4)

- [ ] Test pin/unpin functionality
- [ ] Test favorite/unfavorite functionality
- [ ] Test persistence across sessions
- [ ] Test with nested folders
- [ ] Test edge cases (pinning all items, etc.)
- [ ] Accessibility testing
- [ ] Performance testing
- [ ] User feedback and iteration

## Technical Considerations

### Performance

- Index \`pinned\` and \`favorite\` columns for faster queries
- Cache sorted item lists
- Optimize re-renders when pin/favorite state changes

### Data Migration

- Existing items will have \`pinned = 0\` and \`favorite = 0\` by default
- No data loss during migration
- Migration should be reversible

### Accessibility

- Add ARIA labels for pin/favorite actions
- Ensure keyboard navigation works
- Screen reader announcements for state changes

### Mobile Support

- Context menu works on mobile (long press)
- Touch-friendly icon sizes
- Visual feedback on tap

## Testing Strategy

### Unit Tests

- Pin/unpin mutations
- Favorite/unfavorite mutations
- Sort logic with pinned items
- Type conversions (boolean to integer)

### Integration Tests

- Context menu interactions
- Database persistence
- State updates in UI
- Sorting behavior

### E2E Tests

- Pin item from context menu
- Favorite note from context menu
- Verify pinned items appear at top
- Verify favorites are marked
- Test persistence after page reload

## Future Enhancements

- Pin order customization (drag to reorder pinned items)
- Favorite notes quick access panel
- Keyboard shortcuts for pin/favorite (e.g., Cmd+P, Cmd+F)
- Bulk pin/favorite operations
- Pin/favorite counts in folder badges
- Export/import pin and favorite states
- Pin/favorite in search results
- Favorite notes widget/dashboard

## Resources

- Lucide icons: Pin, Star icons
- Context menu component documentation
- Database migration best practices
- Accessibility guidelines for interactive elements
`
}

