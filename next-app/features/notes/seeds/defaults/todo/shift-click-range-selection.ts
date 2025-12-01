import type { DefaultNote } from '@/features/notes/utils/initialize-defaults'

export const shiftClickRangeSelectionNoteSeed: DefaultNote = {
  name: 'Shift+Click Range Selection',
  parentFolderName: 'servo',
  contentMarkdown: `# Shift+Click Range Selection Implementation Plan

## Overview

Implement Shift+click range selection functionality that allows users to select a range of items between two clicks, similar to file explorers and list views. This complements multi-select and provides an efficient way to select consecutive items.

## Goals

- Enable Shift+click to select ranges of items
- Support range selection in flat and nested folder structures
- Visual feedback for range selection
- Combine with Ctrl/Cmd+click for complex selections
- Maintain intuitive behavior matching user expectations
- Support keyboard navigation for range selection

## Features

### 1. Range Selection

- **Shift+Click**: Select range from last selected item to clicked item
- **Anchor Point**: First item clicked becomes the anchor
- **Range Highlight**: Visual indication of the range being selected
- **Multiple Ranges**: Combine with Ctrl/Cmd+click for multiple ranges
- **Deselect Range**: Shift+click on selected range to deselect

### 2. Selection Behavior

- **First Click**: Sets anchor point (no range yet)
- **Shift+Click**: Selects from anchor to clicked item (inclusive)
- **Ctrl+Shift+Click**: Extends range from anchor
- **Click without modifiers**: Clears selection and sets new anchor
- **Range Direction**: Works both up and down the list

### 3. Visual Feedback

- **Range Preview**: Highlight items in range before releasing Shift
- **Selected Range**: Clear visual distinction for selected range
- **Anchor Indicator**: Subtle indicator for the anchor item
- **Range Boundaries**: Visual markers for start/end of range

## Architecture

### 1. Selection State Enhancement

#### Add Range Selection to Store

\`\`\`typescript
// src/stores/selection-store.ts
interface SelectionState {
  selectedIds: Set<string>
  anchorId: string | null
  lastSelectedId: string | null
  isMultiSelectMode: boolean
  
  // Range selection methods
  setAnchor: (id: string) => void
  selectRange: (fromId: string, toId: string, itemIds: string[]) => void
  clearAnchor: () => void
  getRangeBetween: (fromId: string, toId: string, itemIds: string[]) => string[]
}

export const useSelectionStore = create<SelectionState>((set, get) => ({
  // ... existing state
  
  anchorId: null,
  lastSelectedId: null,
  
  setAnchor: (id: string) => set({
    anchorId: id,
    lastSelectedId: id,
    selectedIds: new Set([id]),
    isMultiSelectMode: true
  }),
  
  selectRange: (fromId: string, toId: string, itemIds: string[]) => {
    const range = get().getRangeBetween(fromId, toId, itemIds)
    const currentSelection = get().selectedIds
    const newSelection = new Set([...currentSelection, ...range])
    
    set({
      selectedIds: newSelection,
      lastSelectedId: toId,
      isMultiSelectMode: true
    })
  },
  
  clearAnchor: () => set({
    anchorId: null,
    lastSelectedId: null
  }),
  
  getRangeBetween: (fromId: string, toId: string, itemIds: string[]) => {
    const fromIndex = itemIds.indexOf(fromId)
    const toIndex = itemIds.indexOf(toId)
    
    if (fromIndex === -1 || toIndex === -1) {
      return []
    }
    
    const start = Math.min(fromIndex, toIndex)
    const end = Math.max(fromIndex, toIndex)
    
    return itemIds.slice(start, end + 1)
  }
}))
\`\`\`

### 2. FileTreeItem Updates

#### Handle Shift+Click

\`\`\`typescript
// src/components/sidebar/sidebar-component.tsx
function FileTreeItem({ item, itemIndex, allItemIds, ...props }) {
  const {
    toggleSelection,
    isSelected,
    setAnchor,
    selectRange,
    anchorId,
    clearSelection,
    clearAnchor
  } = useSelectionStore()
  
  const isItemSelected = isSelected(item.id)
  const isAnchor = anchorId === item.id
  
  const handleClick = (e: React.MouseEvent) => {
    // Shift+Click for range selection
    if (e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      e.stopPropagation()
      
      if (anchorId) {
        // Select range from anchor to this item
        selectRange(anchorId, item.id, allItemIds)
      } else {
        // Set this as anchor
        setAnchor(item.id)
      }
      return
    }
    
    // Ctrl/Cmd+Click for multi-select
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      e.stopPropagation()
      toggleSelection(item.id)
      // Update anchor if this is first selection
      if (!anchorId && !isItemSelected) {
        setAnchor(item.id)
      }
      return
    }
    
    // Regular click - clear selection and set new anchor
    clearSelection()
    setAnchor(item.id)
    
    // ... existing click handler
  }
  
  return (
    <button
      onClick={handleClick}
      className={cn(
        isItemSelected && "bg-primary/20 ring-2 ring-primary",
        isAnchor && "ring-primary ring-2 ring-offset-2"
      )}
      data-anchor={isAnchor}
    >
      {/* ... existing content */}
      {isAnchor && (
        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary" />
      )}
    </button>
  )
}
\`\`\`

### 3. Flat List Item IDs

#### Get All Visible Item IDs

\`\`\`typescript
// src/components/sidebar/sidebar-component.tsx
const getAllVisibleItemIds = useCallback((items: Item[]): string[] => {
  const ids: string[] = []
  
  const collectIds = (itemList: Item[]) => {
    for (const item of itemList) {
      ids.push(item.id)
      if (item.type === 'folder' && expandedFolders.has(item.id)) {
        collectIds(item.children)
      }
    }
  }
  
  collectIds(items)
  return ids
}, [expandedFolders])

// Pass to FileTreeItem
{filteredItems.map((item, index) => (
  <FileTreeItem
    key={item.id}
    item={item}
    itemIndex={index}
    allItemIds={getAllVisibleItemIds(filteredItems)}
    // ... other props
  />
))}
\`\`\`

### 4. Range Preview

#### Visual Feedback During Selection

\`\`\`typescript
// Show preview when hovering during Shift+click
const [rangePreview, setRangePreview] = useState<string[]>([])

const handleMouseEnter = (e: React.MouseEvent) => {
  if (e.shiftKey && anchorId) {
    const previewRange = getRangeBetween(anchorId, item.id, allItemIds)
    setRangePreview(previewRange)
  }
}

const handleMouseLeave = () => {
  setRangePreview([])
}

// Apply preview styling
const isInPreview = rangePreview.includes(item.id)
const isInRange = isInPreview || (anchorId && isItemSelected)

<button
  onMouseEnter={handleMouseEnter}
  onMouseLeave={handleMouseLeave}
  className={cn(
    isInRange && "bg-primary/10",
    isInPreview && "bg-primary/5 border-dashed border-primary"
  )}
>
\`\`\`

### 5. Keyboard Range Selection

#### Shift+Arrow Keys

\`\`\`typescript
// src/components/sidebar/sidebar-component.tsx
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    const focusedItem = document.activeElement?.closest('[data-item-id]')
    if (!focusedItem) return
    
    const itemId = focusedItem.getAttribute('data-item-id')
    if (!itemId) return
    
    // Shift+Arrow for range selection
    if (e.shiftKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      
      const allIds = getAllVisibleItemIds(items)
      const currentIndex = allIds.indexOf(itemId)
      
      if (currentIndex === -1) return
      
      const nextIndex = e.key === 'ArrowDown' 
        ? Math.min(currentIndex + 1, allIds.length - 1)
        : Math.max(currentIndex - 1, 0)
      
      const nextId = allIds[nextIndex]
      
      if (anchorId) {
        selectRange(anchorId, nextId, allIds)
      } else {
        setAnchor(itemId)
        selectRange(itemId, nextId, allIds)
      }
      
      // Focus next item
      const nextElement = document.querySelector(\`[data-item-id="\${nextId}"]\`)
      if (nextElement instanceof HTMLElement) {
        nextElement.focus()
      }
    }
  }
  
  document.addEventListener('keydown', handleKeyDown)
  return () => document.removeEventListener('keydown', handleKeyDown)
}, [items, anchorId, getAllVisibleItemIds, selectRange, setAnchor])
\`\`\`

### 6. Nested Folder Support

#### Handle Range Selection in Nested Structure

\`\`\`typescript
// Range selection should work within the same level
// When selecting across folder boundaries, include all visible items

const getFlatVisibleItemIds = (items: Item[], expandedFolders: Set<string>): string[] => {
  const ids: string[] = []
  
  const traverse = (itemList: Item[]) => {
    for (const item of itemList) {
      ids.push(item.id)
      if (item.type === 'folder' && expandedFolders.has(item.id)) {
        traverse(item.children)
      }
    }
  }
  
  traverse(items)
  return ids
}

// Use flat list for range selection
const allVisibleIds = getFlatVisibleItemIds(filteredItems, expandedFolders)
\`\`\`

## Implementation Phases

### Phase 1: Basic Range Selection (Week 1)

- [ ] Add anchor point to selection store
- [ ] Implement \`getRangeBetween\` function
- [ ] Implement \`selectRange\` method
- [ ] Handle Shift+click in FileTreeItem
- [ ] Test basic range selection

### Phase 2: Visual Feedback (Week 1-2)

- [ ] Add anchor indicator
- [ ] Implement range preview on hover
- [ ] Style selected range items
- [ ] Add visual boundaries for range
- [ ] Test visual feedback

### Phase 3: Combined Selection (Week 2)

- [ ] Support Ctrl+Shift+click (extend range)
- [ ] Handle multiple ranges
- [ ] Combine range and individual selections
- [ ] Test complex selection scenarios

### Phase 4: Keyboard Support (Week 2-3)

- [ ] Implement Shift+Arrow key range selection
- [ ] Handle focus management
- [ ] Support Shift+Home/End for range to start/end
- [ ] Test keyboard navigation

### Phase 5: Nested Folders (Week 3)

- [ ] Handle range selection in nested structures
- [ ] Support range across folder boundaries
- [ ] Handle collapsed folders in range
- [ ] Test with deep folder structures

### Phase 6: Edge Cases & Polish (Week 3-4)

- [ ] Handle edge cases (first item, last item, etc.)
- [ ] Test with filtered/search results
- [ ] Test with pinned items
- [ ] Performance optimization
- [ ] Accessibility improvements
- [ ] User feedback and iteration

## Technical Details

### Range Selection Logic

- Range includes both start and end items (inclusive)
- Range works in both directions (up and down)
- Range respects current sort order
- Range includes only visible items

### Anchor Point Behavior

- First click sets anchor
- Shift+click extends from anchor
- Ctrl+click preserves anchor
- Regular click sets new anchor
- Clear selection clears anchor

### Performance Considerations

- Efficient range calculation (O(n) where n is visible items)
- Minimize re-renders during range selection
- Cache visible item IDs list
- Optimize for large lists

### Accessibility

- ARIA labels for range selection
- Keyboard navigation support
- Screen reader announcements
- Focus management

## UI/UX Design

### Visual Indicators

- **Anchor Item**: Stronger border or different color
- **Range Items**: Highlighted background
- **Range Preview**: Dashed border on hover
- **Range Boundaries**: Subtle markers

### Selection States

\`\`\`
Normal:     [Item 1] [Item 2] [Item 3]
            └─ anchor

Shift+Click on Item 3:
Selected:  [Item 1] [Item 2] [Item 3]
            └─ anchor        └─ end
            └──────── range ──────┘
\`\`\`

## Testing Strategy

### Unit Tests

- Range calculation logic
- Anchor point management
- Range selection methods
- Edge cases (empty list, single item, etc.)

### Integration Tests

- Shift+click range selection
- Ctrl+Shift+click behavior
- Keyboard range selection
- Combined with multi-select

### E2E Tests

- Select range with Shift+click
- Extend range with Shift+click
- Combine with Ctrl+click
- Keyboard range selection
- Range selection in nested folders

## Edge Cases

- Range selection with only one item
- Range selection at list boundaries
- Range selection with filtered items
- Range selection with collapsed folders
- Range selection during drag-and-drop
- Range selection with pinned items
- Range selection across different parent folders

## Interaction Patterns

### Pattern 1: Simple Range

1. Click Item A (sets anchor)
2. Shift+Click Item D (selects A, B, C, D)

### Pattern 2: Extend Range

1. Click Item A (sets anchor)
2. Shift+Click Item C (selects A, B, C)
3. Shift+Click Item E (selects A, B, C, D, E)

### Pattern 3: Multiple Ranges

1. Click Item A (sets anchor)
2. Shift+Click Item C (selects A, B, C)
3. Ctrl+Click Item F (adds F)
4. Shift+Click Item H (selects F, G, H)

### Pattern 4: Reverse Range

1. Click Item D (sets anchor)
2. Shift+Click Item A (selects A, B, C, D)

## Future Enhancements

- Range selection with mouse drag
- Visual range selection box (like file explorer)
- Range selection across different views
- Save range as selection group
- Range selection with patterns (every Nth item)
- Smart range selection (select by criteria)
`
}

