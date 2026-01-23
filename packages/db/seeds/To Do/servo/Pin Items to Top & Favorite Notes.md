# Pin Items to Top & Favorite Notes Implementation Plan

## Overview

Implement the ability to "Pin" notes/folders to the top of their list and "Favorite" notes for quick access. These are two distinct but related features for organizing important content.

## Goals

- **Pinning**: Keep important items at the top of their specific folder.
- **Favorites**: Add items to a global "Favorites" list (sidebar section).
- Persist these states in the database.
- Provide visual indicators (icons).
- Support sorting logic to respect pinned status.

## Current State

### Database Schema

We need to check if `isPinned` and `isFavorite` fields exist on the `Note` entity.

```typescript
// Likely needed schema update
model Note {
  // ... existing fields
  isPinned    Boolean @default(false)
  isFavorite  Boolean @default(false)
}
```

### UI

- No visual indicators currently.
- Sorting is likely alphabetical or by date.
- No "Favorites" section in the sidebar.

## Architecture

### 1. Database & API

#### Schema Update

- Add `isPinned` (boolean) to `notes` table.
- Add `isFavorite` (boolean) to `notes` table.
- Run migration.

#### API Updates

- Update `createNote` / `updateNote` to handle these fields.
- Ensure `getNotes` returns these fields.

### 2. Pinning Feature

#### Sorting Logic

Modify the file tree sorting function:

```typescript
const sortNodes = (nodes: Node[]) => {
	return nodes.sort((a, b) => {
		// 1. Folders first (usually)
		if (a.type !== b.type) return a.type === 'folder' ? -1 : 1

		// 2. Pinned items first
		if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1

		// 3. Alphabetical
		return a.name.localeCompare(b.name)
	})
}
```

#### UI Actions

- Add "Pin to top" / "Unpin" to context menu.
- Add Pin icon (📌) next to item name in the tree.

### 3. Favorites Feature

#### Sidebar Section

- Create a new `FavoritesSection` component in the sidebar.
- This section queries for all notes where `isFavorite === true`.
- Displays them in a flat list (or simple tree).

#### UI Actions

- Add "Add to Favorites" / "Remove from Favorites" to context menu.
- Add Star icon (⭐) to item name (optional, or just in the Favorites list).
- Toggle favorite status from the note header (Star button).

## Implementation Phases

### Phase 1: Backend (Week 1)

- [ ] Update Drizzle schema.
- [ ] Create migration.
- [ ] Update API types and validation.

### Phase 2: Pinning UI (Week 1)

- [ ] Update `FileTreeNode` to show pin icon.
- [ ] Add context menu actions.
- [ ] Implement sorting logic in `FileTree`.

### Phase 3: Favorites UI (Week 2)

- [ ] Create `FavoritesList` component.
- [ ] Add "Favorites" section to Sidebar.
- [ ] Add context menu actions.
- [ ] Add toggle button in Note Header.

## Technical Details

### Optimistic Updates

When toggling pin/favorite, update the UI immediately before the API call completes to ensure responsiveness.

```typescript
const togglePin = (id: string, currentStatus: boolean) => {
	// 1. Optimistic update in store
	updateNode(id, { isPinned: !currentStatus })

	// 2. API call
	api.updateNote(id, { isPinned: !currentStatus }).catch(() => {
		// Revert on failure
		updateNode(id, { isPinned: currentStatus })
	})
}
```

### Favorites List Data

The Favorites list needs to be kept in sync. If we use a global store (like React Query or Zustand), updating a note's `isFavorite` property should automatically update the Favorites list if it's derived from the main notes cache.

If `Favorites` is a separate query, we need to invalidate it when a note is updated.

## UX Considerations

- **Pinning**: Should pinned items be separated by a divider? (Maybe just visual sorting is enough).
- **Favorites**: Should clicking a favorite navigate to the note in its original folder context (expanding the tree) or just open the note?
    - _Recommendation_: Just open the note. Highlight it in the main tree if visible.

## Future Enhancements

- **Smart Folders**: "Recently Modified", "Created Today" (similar to Favorites but dynamic).
- **Custom Sort Order**: Allow manual reordering of pinned items.
