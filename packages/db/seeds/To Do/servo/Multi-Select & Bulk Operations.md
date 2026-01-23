# Multi-Select & Bulk Operations Implementation Plan

## Overview

Implement multi-selection capabilities in the file tree and bulk operations (delete, move, favorite) for selected items. This enhances the user's ability to manage large numbers of notes efficiently.

## Goals

- Allow selecting multiple items using `Shift+Click` (range) and `Cmd/Ctrl+Click` (toggle)
- Visualize selection state clearly in the file tree
- Provide a context menu or toolbar for bulk actions
- Support bulk delete, bulk move, and bulk favorite/unfavorite
- Ensure performance with large selections
- Maintain accessibility and keyboard navigation

## Current State

### Existing Implementation

- Single item selection (active note)
- Context menu for single item actions
- Drag and drop for single items
- No multi-select state or logic

### Architecture Gaps

- `FileTree` component assumes single active item
- No global selection state management
- Context menu logic is tied to individual items
- Backend API supports single item operations (mostly)

## Architecture

### 1. Selection State Management

#### Store Updates

```typescript
// src/features/file-tree/stores/selection-store.ts
import { create } from 'zustand'

interface SelectionState {
	selectedIds: Set<string>
	lastSelectedId: string | null // For Shift+Click range calculation
	isMultiSelectMode: boolean

	// Actions
	selectId: (id: string, multi: boolean, range: boolean) => void
	deselectId: (id: string) => void
	clearSelection: () => void
	selectAll: (ids: string[]) => void
	toggleSelection: (id: string) => void
}
```

#### Selection Logic

- **Click**: Select single item, clear others
- **Cmd/Ctrl+Click**: Toggle item selection, keep others
- **Shift+Click**: Select range from `lastSelectedId` to current `id`
- **Esc**: Clear selection

### 2. File Tree Component Updates

#### `FileTreeNode` Component

- Accept `isSelected` prop
- Handle click events with modifiers
- Update visual style for selected state
- Prevent opening note on click if in multi-select mode? (Design decision: Maybe open last selected, or don't open any)

#### `FileTree` Component

- Integrate `SelectionStore`
- Pass selection state to nodes
- Handle keyboard events (Shift+Up/Down for keyboard selection)

### 3. Bulk Actions UI

#### Floating Action Bar (FAB) or Context Menu

When multiple items are selected:

- Show a floating toolbar at the bottom or top of the tree
- Or update the context menu to show bulk actions

**Actions:**

- 🗑️ Delete ({n} items)
- 📁 Move to...
- ⭐ Favorite / Unfavorite
- 📌 Pin / Unpin
- 🏷️ Add Tag (future)

### 4. Backend & API Updates

#### Bulk API Endpoints

We need to ensure our API can handle bulk operations efficiently.

- `POST /api/notes/bulk-delete`
    - Body: `{ ids: string[] }`
- `POST /api/notes/bulk-move`
    - Body: `{ ids: string[], targetFolderId: string }`
- `POST /api/notes/bulk-update`
    - Body: `{ ids: string[], updates: Partial<Note> }` (for favorites/pins)

#### Optimistic Updates

- Update UI immediately
- Revert if API fails
- Show progress toast for large batches

## Implementation Phases

### Phase 1: Selection Logic (Week 1)

- [ ] Create `SelectionStore`
- [ ] Implement `Ctrl/Cmd+Click` logic
- [ ] Implement `Shift+Click` range logic (requires flattened tree list)
- [ ] Update `FileTreeNode` visual state
- [ ] Prevent default navigation on multi-select

### Phase 2: Bulk Actions UI (Week 2)

- [ ] Design Bulk Action Bar
- [ ] Implement "Delete Selected" button
- [ ] Implement "Favorite Selected" button
- [ ] Implement "Move Selected" (requires folder picker modal)
- [ ] Add "Select All" / "Deselect All" controls

### Phase 3: API & Integration (Week 3)

- [ ] Create bulk API endpoints (or use `Promise.all` with existing ones initially)
- [ ] Integrate UI actions with API
- [ ] Add confirmation dialogs for bulk delete
- [ ] Implement optimistic UI updates
- [ ] Handle partial failures (e.g., 5 of 10 deleted)

### Phase 4: Drag & Drop (Advanced) (Week 4)

- [ ] Allow dragging multiple selected items
- [ ] Update drag preview to show stack of items
- [ ] Handle drop logic for multiple items
- [ ] Ensure smooth performance

## Technical Details

### Range Selection (Shift+Click)

To implement Shift+Click, we need a linear representation of the visible tree items.

```typescript
// Helper to flatten visible tree
const getVisibleItems = (nodes: TreeNode[], expandedFolders: Set<string>): string[] => {
	let items: string[] = []

	nodes.forEach((node) => {
		items.push(node.id)
		if (node.type === 'folder' && expandedFolders.has(node.id)) {
			items = [...items, ...getVisibleItems(node.children, expandedFolders)]
		}
	})

	return items
}

// In store action
selectRange: (targetId: string, visibleIds: string[]) => {
	const start = visibleIds.indexOf(lastSelectedId)
	const end = visibleIds.indexOf(targetId)
	const range = visibleIds.slice(Math.min(start, end), Math.max(start, end) + 1)
	// Add range to selectedIds
}
```

### Bulk Move UI

- Reuse existing "Move to" modal if available, or create one
- Filter out selected folders from destination options (can't move folder into itself)
- Validate moves (prevent cycles)

## UX Considerations

- **Visual Feedback**: Clearly show how many items are selected.
- **Safety**: Always confirm bulk delete.
- **Undo**: Provide "Undo" toast for bulk actions if possible.
- **Keyboard**: Support `Ctrl+A` to select all visible items? (Careful with scope)

## Future Enhancements

- Bulk export
- Bulk tag assignment
- Bulk publish/unpublish
- Copy links for multiple notes
