import { create } from 'zustand'

interface SelectionState {
    // Selected item IDs
    selectedIds: Set<string>

    // Multi-select mode state
    isMultiSelectMode: boolean

    // Actions
    selectItem: (id: string) => void
    deselectItem: (id: string) => void
    toggleSelection: (id: string) => void
    selectAll: (ids: string[]) => void
    clearSelection: () => void

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

        // Select an item (adds to selection)
        selectItem: (id: string) => set((state) => {
            const newSelectedIds = new Set(state.selectedIds)
            newSelectedIds.add(id)
            return {
                selectedIds: newSelectedIds,
                isMultiSelectMode: true
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
                isMultiSelectMode: newSelectedIds.size > 0
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
            isMultiSelectMode: false
        }),

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