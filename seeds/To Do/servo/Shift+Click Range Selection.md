# Shift+Click Range Selection Implementation Plan

## Overview

Implement `Shift+Click` range selection in the file tree. This allows users to select a contiguous block of items (notes and folders) by clicking one item and then Shift-clicking another.

## Goals

- Enable intuitive range selection standard in most file explorers.
- Visually highlight the selected range.
- Support subsequent bulk operations on the range.
- Handle complex tree states (expanded/collapsed folders).

## Current State

- Single click selects/opens an item.
- No range selection logic exists.
- `FileTree` renders recursively, making linear index calculation non-trivial.

## Architecture

### 1. Linearizing the Tree

To determine "start" and "end" of a range, we need a linear list of **currently visible** items.

```typescript
interface FlatItem {
  id: string
  parentId: string | null
  level: number
  node: TreeNode
}

const flattenTree = (nodes: TreeNode[], expandedIds: Set<string>, level = 0): FlatItem[] => {
  let result: FlatItem[] = []
  
  for (const node of nodes) {
    result.push({ id: node.id, parentId: node.parentId, level, node })
    
    if (node.type === 'folder' && expandedIds.has(node.id)) {
      result = [...result, ...flattenTree(node.children, expandedIds, level + 1)]
    }
  }
  
  return result
}
```

### 2. Selection Logic

#### State

- `anchorId`: The ID of the item where the selection started (the first click).
- `selectedIds`: Set of all currently selected IDs.

#### Interaction

1. **Click (without Shift)**:
   - Set `anchorId` = current ID.
   - Set `selectedIds` = [current ID].

2. **Shift+Click (target ID)**:
   - Get linear list of visible items.
   - Find index of `anchorId`.
   - Find index of `target ID`.
   - Select all items between `min(index1, index2)` and `max(index1, index2)`.
   - Update `selectedIds`.

### 3. Visual Feedback

- **Selected Item**: Standard highlight color (e.g., blue background).
- **Range Selection**: All items in range get the highlight.
- **Focus**: The item just clicked should have focus ring/style.

## Implementation Details

### `useSelection` Hook

```typescript
export function useSelection(items: TreeNode[], expandedIds: Set<string>) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [anchorId, setAnchorId] = useState<string | null>(null)
  
  const handleSelect = (id: string, event: React.MouseEvent) => {
    if (event.shiftKey && anchorId) {
      // Perform range selection
      const flatList = flattenTree(items, expandedIds)
      const startIdx = flatList.findIndex(item => item.id === anchorId)
      const endIdx = flatList.findIndex(item => item.id === id)
      
      const newSelection = new Set<string>()
      const [lower, upper] = [Math.min(startIdx, endIdx), Math.max(startIdx, endIdx)]
      
      for (let i = lower; i <= upper; i++) {
        newSelection.add(flatList[i].id)
      }
      
      setSelectedIds(newSelection)
    } else if (event.metaKey || event.ctrlKey) {
      // Toggle selection (Multi-select plan)
      // ...
    } else {
      // Single select
      setAnchorId(id)
      setSelectedIds(new Set([id]))
    }
  }
  
  return { selectedIds, handleSelect }
}
```

## Edge Cases

- **Collapsed Folders**: If a folder is collapsed, its children are not visible and should not be part of the selection range (unless the folder itself is selected). The `flattenTree` logic handles this by checking `expandedIds`.
- **Hidden Items**: Ensure filtered-out items (search results) are handled correctly. The `flattenTree` should operate on the *rendered* list.
- **Keyboard Navigation**: `Shift+ArrowDown` / `Shift+ArrowUp` should extend the selection from the anchor.

## Integration Steps

1. **Refactor FileTree**: Ensure it can generate or access the flattened visible list.
2. **Integrate Hook**: Use `useSelection` in the main `FileTree` component.
3. **Pass Props**: Pass `isSelected` and `onClick` handler to `FileTreeNode`.
4. **Style Updates**: Update CSS for selected state.

## UX Considerations

- **Text Selection**: Prevent browser text selection when Shift-clicking (user `user-select: none` on tree items).
- **Performance**: Flattening the tree on every click might be expensive for huge lists. Memoize the flat list and only recompute when `expandedIds` or `nodes` change.
