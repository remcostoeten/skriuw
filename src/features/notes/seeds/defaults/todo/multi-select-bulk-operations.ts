import type { DefaultNote } from '@/features/notes/utils/initialize-defaults'

export const multiSelectBulkOperationsNoteSeed: DefaultNote = {
  name: 'Multi-Select & Bulk Operations',
  parentFolderName: 'servo',
  contentMarkdown: `# Multi-Select & Bulk Operations Implementation Plan

## Overview

Implement Ctrl+click (Cmd+click on Mac) multi-selection functionality for notes and folders, enabling users to select multiple items and perform bulk operations similar to file explorers. This will significantly improve workflow efficiency for managing multiple items at once.

## Goals

- Enable Ctrl/Cmd+click to select multiple items
- Support visual selection indicators
- Implement bulk operations (delete, move, rename, pin, favorite, etc.)
- Provide selection state management
- Support keyboard shortcuts for selection
- Maintain accessibility standards

## Features

### 1. Multi-Selection

- **Ctrl+Click / Cmd+Click**: Toggle item selection
- **Visual Indicators**: Highlight selected items
- **Selection Count**: Display number of selected items
- **Clear Selection**: Click outside or press Escape
- **Select All**: Ctrl/Cmd+A to select all visible items
- **Invert Selection**: Ctrl/Cmd+Shift+I

### 2. Bulk Operations

- **Delete**: Delete all selected items
- **Move**: Move all selected items to a folder
- **Pin/Unpin**: Pin or unpin all selected items
- **Favorite/Unfavorite**: Favorite or unfavorite selected notes
- **Rename**: Batch rename with pattern (e.g., "Note {n}")
- **Export**: Export selected notes
- **Copy**: Copy selected items (for clipboard operations)

## Architecture

### 1. Selection State Management

#### Selection Store

\`\`\`typescript
// src/stores/selection-store.ts
import { create } from 'zustand'

interface SelectionState {
  selectedIds: Set<string>
  isMultiSelectMode: boolean
  selectItem: (id: string) => void
  deselectItem: (id: string) => void
  toggleSelection: (id: string) => void
  selectAll: (ids: string[]) => void
  clearSelection: () => void
  isSelected: (id: string) => boolean
  getSelectedCount: () => number
}

export const useSelectionStore = create<SelectionState>((set, get) => ({
  selectedIds: new Set(),
  isMultiSelectMode: false,
  
  selectItem: (id: string) => set((state) => ({
    selectedIds: new Set([...state.selectedIds, id]),
    isMultiSelectMode: true
  })),
  
  deselectItem: (id: string) => set((state) => {
    const newSet = new Set(state.selectedIds)
    newSet.delete(id)
    return {
      selectedIds: newSet,
      isMultiSelectMode: newSet.size > 0
    }
  }),
  
  toggleSelection: (id: string) => set((state) => {
    const newSet = new Set(state.selectedIds)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    return {
      selectedIds: newSet,
      isMultiSelectMode: newSet.size > 0
    }
  }),
  
  selectAll: (ids: string[]) => set({
    selectedIds: new Set(ids),
    isMultiSelectMode: true
  }),
  
  clearSelection: () => set({
    selectedIds: new Set(),
    isMultiSelectMode: false
  }),
  
  isSelected: (id: string) => {
    return get().selectedIds.has(id)
  },
  
  getSelectedCount: () => get().selectedIds.size
}))
\`\`\`

### 2. FileTreeItem Updates

#### Handle Ctrl/Cmd+Click

\`\`\`typescript
// src/components/sidebar/sidebar-component.tsx
function FileTreeItem({ item, ...props }) {
  const { toggleSelection, isSelected, clearSelection } = useSelectionStore()
  const isItemSelected = isSelected(item.id)
  
  const handleClick = (e: React.MouseEvent) => {
    // Ctrl/Cmd+Click for multi-select
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      e.stopPropagation()
      toggleSelection(item.id)
      return
    }
    
    // Regular click - clear selection if clicking on non-selected item
    if (!isItemSelected) {
      clearSelection()
    }
    
    // ... existing click handler
  }
  
  return (
    <button
      onClick={handleClick}
      className={cn(
        isItemSelected && "bg-primary/20 ring-2 ring-primary"
      )}
    >
      {/* ... existing content */}
    </button>
  )
}
\`\`\`

### 3. Selection Indicator

#### Visual Feedback

\`\`\`typescript
// Add selection checkbox or highlight
{isItemSelected && (
  <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
)}

{isItemSelected && (
  <Checkbox
    checked={true}
    className="mr-2"
    onClick={(e) => {
      e.stopPropagation()
      toggleSelection(item.id)
    }}
  />
)}
\`\`\`

### 4. Bulk Operations Bar

#### Action Bar Component

\`\`\`typescript
// src/components/sidebar/bulk-operations-bar.tsx
export function BulkOperationsBar() {
  const { selectedIds, getSelectedCount, clearSelection } = useSelectionStore()
  const { deleteItem, moveItem } = useNotes()
  const count = getSelectedCount()
  
  if (count === 0) return null
  
  const handleBulkDelete = async () => {
    if (confirm(\`Delete \${count} item(s)?\`)) {
      for (const id of selectedIds) {
        await deleteItem(id)
      }
      clearSelection()
    }
  }
  
  const handleBulkMove = async (targetFolderId: string) => {
    for (const id of selectedIds) {
      await moveItem(id, targetFolderId)
    }
    clearSelection()
  }
  
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
      <div className="bg-background border border-border rounded-lg shadow-lg px-4 py-2 flex items-center gap-4">
        <span className="text-sm font-medium">
          {count} item{count !== 1 ? 's' : ''} selected
        </span>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleBulkDelete}>
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </Button>
          
          <Button variant="outline" size="sm" onClick={handleBulkMove}>
            <FolderOpen className="w-4 h-4 mr-2" />
            Move
          </Button>
          
          <Button variant="outline" size="sm" onClick={clearSelection}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}
\`\`\`

### 5. Keyboard Shortcuts

#### Selection Shortcuts

\`\`\`typescript
// src/components/sidebar/sidebar-component.tsx
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    // Escape to clear selection
    if (e.key === 'Escape') {
      clearSelection()
    }
    
    // Ctrl/Cmd+A to select all
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      e.preventDefault()
      const allIds = getAllVisibleItemIds(items)
      selectAll(allIds)
    }
    
    // Delete key to delete selected items
    if (e.key === 'Delete' && getSelectedCount() > 0) {
      handleBulkDelete()
    }
  }
  
  document.addEventListener('keydown', handleKeyDown)
  return () => document.removeEventListener('keydown', handleKeyDown)
}, [])
\`\`\`

### 6. Bulk Operations Menu

#### Context Menu for Selected Items

\`\`\`typescript
// When multiple items are selected, show bulk operations menu
{getSelectedCount() > 1 && (
  <ContextMenuContent>
    <ContextMenuItem onClick={handleBulkDelete}>
      <Trash2 className="w-4 h-4 mr-3" />
      Delete {getSelectedCount()} items
    </ContextMenuItem>
    
    <ContextMenuItem onClick={handleBulkMove}>
      <FolderOpen className="w-4 h-4 mr-3" />
      Move {getSelectedCount()} items...
    </ContextMenuItem>
    
    <ContextMenuItem onClick={handleBulkPin}>
      <Pin className="w-4 h-4 mr-3" />
      Pin {getSelectedCount()} items
    </ContextMenuItem>
    
    <ContextMenuItem onClick={handleBulkUnpin}>
      <Unpin className="w-4 h-4 mr-3" />
      Unpin {getSelectedCount()} items
    </ContextMenuItem>
    
    <ContextMenuSeparator />
    
    <ContextMenuItem onClick={clearSelection}>
      Clear selection
    </ContextMenuItem>
  </ContextMenuContent>
)}
\`\`\`

## Implementation Phases

### Phase 1: Selection State (Week 1)

- [ ] Create selection store (Zustand or similar)
- [ ] Implement basic selection methods (select, deselect, toggle)
- [ ] Add selection state to FileTreeItem
- [ ] Test selection state management

### Phase 2: Visual Indicators (Week 1-2)

- [ ] Add visual highlight for selected items
- [ ] Add selection checkbox indicator
- [ ] Implement selection count display
- [ ] Style selected items appropriately
- [ ] Test visual feedback

### Phase 3: Ctrl/Cmd+Click (Week 2)

- [ ] Implement Ctrl/Cmd+click handler
- [ ] Handle click events properly
- [ ] Prevent default navigation on Ctrl+click
- [ ] Test on different platforms (Windows, Mac, Linux)

### Phase 4: Keyboard Shortcuts (Week 2)

- [ ] Implement Escape to clear selection
- [ ] Implement Ctrl/Cmd+A to select all
- [ ] Implement Delete key for bulk delete
- [ ] Add other useful shortcuts
- [ ] Test keyboard interactions

### Phase 5: Bulk Operations (Week 3)

- [ ] Implement bulk delete
- [ ] Implement bulk move
- [ ] Implement bulk pin/unpin
- [ ] Implement bulk favorite/unfavorite
- [ ] Create bulk operations bar
- [ ] Add confirmation dialogs
- [ ] Test all bulk operations

### Phase 6: Advanced Features (Week 3-4)

- [ ] Implement bulk rename with patterns
- [ ] Implement bulk export
- [ ] Add selection persistence (optional)
- [ ] Implement drag-and-drop for selected items
- [ ] Add bulk operations to context menu

### Phase 7: Testing & Polish (Week 4)

- [ ] Test all selection scenarios
- [ ] Test bulk operations
- [ ] Test edge cases (selecting all, empty selection, etc.)
- [ ] Accessibility testing
- [ ] Performance testing with many items
- [ ] Mobile/touch support considerations
- [ ] User feedback and iteration

## Technical Details

### Selection Persistence

- Selection state should NOT persist across page reloads
- Clear selection when navigating away
- Clear selection when switching folders

### Performance Considerations

- Use Set for O(1) selection lookups
- Minimize re-renders when selection changes
- Virtualize if dealing with thousands of items
- Debounce bulk operations if needed

### Accessibility

- ARIA labels for selected items
- Keyboard navigation support
- Screen reader announcements
- Focus management

### Mobile/Touch Support

- Long press to enter multi-select mode
- Tap to toggle selection in multi-select mode
- Swipe gestures for bulk actions (optional)

## UI/UX Design

### Selection Visual Design

- **Background**: Subtle highlight color (e.g., primary/20)
- **Border**: Ring or border in primary color
- **Checkbox**: Optional checkbox indicator
- **Count Badge**: Show selection count in action bar

### Bulk Operations Bar

\`\`\`
┌─────────────────────────────────────────┐
│ 3 items selected                         │
│ [Delete] [Move] [Pin] [Cancel]          │
└─────────────────────────────────────────┘
\`\`\`

### Context Menu Updates

- Show bulk operations when multiple items selected
- Disable single-item operations when in multi-select
- Clear selection option in menu

## Testing Strategy

### Unit Tests

- Selection store methods
- Toggle selection logic
- Select all functionality
- Clear selection

### Integration Tests

- Ctrl+click selection
- Bulk delete operation
- Bulk move operation
- Keyboard shortcuts

### E2E Tests

- Select multiple items
- Perform bulk delete
- Perform bulk move
- Clear selection
- Keyboard shortcuts work

## Edge Cases

- Selecting items in different folders
- Selecting parent and child items
- Selecting all items
- Empty selection
- Selection during drag-and-drop
- Selection during rename operation

## Future Enhancements

- Selection groups/tags
- Save selection as a "collection"
- Bulk export to different formats
- Bulk tagging/categorization
- Selection templates
- Undo/redo for bulk operations
- Selection history
- Smart selection (select by pattern, date, etc.)
`
}

