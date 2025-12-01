import { create } from 'zustand'

interface SelectionState {
    // Selected item IDs
    selectedIds: Set<string>

    // Multi-select mode state
    isMultiSelectMode: boolean

    // Range selection anchor
    anchorId: string | null
    lastSelectedId: string | null

    // Actions
    selectItem: (id: string) => void
    deselectItem: (id: string) => void
    toggleSelection: (id: string) => void
    selectAll: (ids: string[]) => void
    clearSelection: () => void

    // Range selection actions
    setAnchor: (id: string) => void
    selectRange: (fromId: string, toId: string, itemIds: string[]) => void
    clearAnchor: () => void
    getRangeBetween: (fromId: string, toId: string, itemIds: string[]) => string[]

    // Getters
    isSelected: (id: string) => boolean
    getSelectedCount: () => number
    getSelectedIds: () => string[]

    // Multi-select control
    setMultiSelectMode: (enabled: boolean) => void
}

export const useSelectionStore = create<SelectionState>()(
    (set, get) => ({
        // Initial state
        selectedIds: new Set(),
        isMultiSelectMode: false,
        anchorId: null,
        lastSelectedId: null,

        // Select an item (adds to selection)
        selectItem: (id: string) => set((state) => {
            const newSelectedIds = new Set(state.selectedIds)
            newSelectedIds.add(id)
            return {
                selectedIds: newSelectedIds,
                isMultiSelectMode: true,
                lastSelectedId: id
            }
        }),

        // Deselect an item (removes from selection)
        deselectItem: (id: string) => set((state) => {
            const newSelectedIds = new Set(state.selectedIds)
            newSelectedIds.delete(id)
            return {
                selectedIds: newSelectedIds,
                isMultiSelectMode: newSelectedIds.size > 0
            }
        }),

        // Toggle selection (select if not selected, deselect if selected)
        toggleSelection: (id: string) => set((state) => {
            const newSelectedIds = new Set(state.selectedIds)
            if (newSelectedIds.has(id)) {
                newSelectedIds.delete(id)
            } else {
                newSelectedIds.add(id)
            }
            return {
                selectedIds: newSelectedIds,
                isMultiSelectMode: newSelectedIds.size > 0,
                lastSelectedId: newSelectedIds.has(id) ? id : state.lastSelectedId
            }
        }),

        // Select all items from a list
        selectAll: (ids: string[]) => set({
            selectedIds: new Set(ids),
            isMultiSelectMode: true
        }),

        // Clear all selections
        clearSelection: () => set({
            selectedIds: new Set(),
            isMultiSelectMode: false,
            anchorId: null,
            lastSelectedId: null
        }),

        // Set anchor point for range selection
        setAnchor: (id: string) => set({
            anchorId: id,
            lastSelectedId: id,
            selectedIds: new Set([id]),
            isMultiSelectMode: true
        }),

        // Select range from anchor to target
        selectRange: (fromId: string, toId: string, itemIds: string[]) => {
            const range = get().getRangeBetween(fromId, toId, itemIds)
            set({
                selectedIds: new Set(range),
                lastSelectedId: toId,
                isMultiSelectMode: true
            })
        },

        // Clear anchor point
        clearAnchor: () => set({
            anchorId: null,
            lastSelectedId: null
        }),

        // Get range of IDs between two items
        getRangeBetween: (fromId: string, toId: string, itemIds: string[]) => {
            const fromIndex = itemIds.indexOf(fromId)
            const toIndex = itemIds.indexOf(toId)
            
            if (fromIndex === -1 || toIndex === -1) {
                return []
            }
            
            const start = Math.min(fromIndex, toIndex)
            const end = Math.max(fromIndex, toIndex)
            
            return itemIds.slice(start, end + 1)
        },

        // Check if an item is selected
        isSelected: (id: string) => {
            return get().selectedIds.has(id)
        },

        // Get count of selected items
        getSelectedCount: () => {
            return get().selectedIds.size
        },

        // Get array of selected item IDs
        getSelectedIds: () => {
            return Array.from(get().selectedIds)
        },

        // Manually set multi-select mode
        setMultiSelectMode: (enabled: boolean) => set((state) => ({
            isMultiSelectMode: enabled && state.selectedIds.size > 0
        }))
    })
)