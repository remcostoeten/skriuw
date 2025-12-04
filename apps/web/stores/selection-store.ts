'use client'

import { create } from 'zustand'

type props = {
	selectedIds: Set<string>
	isMultiSelectMode: boolean
	anchorId: string | null
	lastSelectedId: string | null
	selectItem: (id: string) => void
	deselectItem: (id: string) => void
	toggleSelection: (id: string) => void
	selectAll: (ids: string[]) => void
	clearSelection: () => void
	setAnchor: (id: string) => void
	selectRange: (fromId: string, toId: string, itemIds: string[]) => void
	clearAnchor: () => void
	getRangeBetween: (fromId: string, toId: string, itemIds: string[]) => string[]
	isSelected: (id: string) => boolean
	getSelectedCount: () => number
	getSelectedIds: () => string[]
	setMultiSelectMode: (enabled: boolean) => void
}

export const useSelectionStore = create<props>()((set, get) => ({
	selectedIds: new Set(),
	isMultiSelectMode: false,
	anchorId: null,
	lastSelectedId: null,

	selectItem: (id) =>
		set((state) => {
			const selectedIds = new Set(state.selectedIds)
			selectedIds.add(id)
			return {
				selectedIds,
				isMultiSelectMode: true,
				lastSelectedId: id,
			}
		}),

	deselectItem: (id) =>
		set((state) => {
			const selectedIds = new Set(state.selectedIds)
			selectedIds.delete(id)
			return {
				selectedIds,
				isMultiSelectMode: selectedIds.size > 0,
			}
		}),

	toggleSelection: (id) =>
		set((state) => {
			const selectedIds = new Set(state.selectedIds)
			if (selectedIds.has(id)) {
				selectedIds.delete(id)
			} else {
				selectedIds.add(id)
			}
			return {
				selectedIds,
				isMultiSelectMode: selectedIds.size > 0,
				lastSelectedId: selectedIds.has(id) ? id : state.lastSelectedId,
			}
		}),

	selectAll: (ids) =>
		set({
			selectedIds: new Set(ids),
			isMultiSelectMode: true,
		}),

	clearSelection: () =>
		set({
			selectedIds: new Set(),
			isMultiSelectMode: false,
			anchorId: null,
			lastSelectedId: null,
		}),

	setAnchor: (id) =>
		set({
			anchorId: id,
			lastSelectedId: id,
			selectedIds: new Set([id]),
			isMultiSelectMode: true,
		}),

	selectRange: (fromId, toId, itemIds) => {
		const range = get().getRangeBetween(fromId, toId, itemIds)
		set({
			selectedIds: new Set(range),
			lastSelectedId: toId,
			isMultiSelectMode: true,
		})
	},

	clearAnchor: () =>
		set({
			anchorId: null,
			lastSelectedId: null,
		}),

	getRangeBetween: (fromId, toId, itemIds) => {
		const fromIndex = itemIds.indexOf(fromId)
		const toIndex = itemIds.indexOf(toId)
		if (fromIndex === -1 || toIndex === -1) {
			return []
		}
		const start = Math.min(fromIndex, toIndex)
		const end = Math.max(fromIndex, toIndex)
		return itemIds.slice(start, end + 1)
	},

	isSelected: (id) => get().selectedIds.has(id),
	getSelectedCount: () => get().selectedIds.size,
	getSelectedIds: () => Array.from(get().selectedIds),

	setMultiSelectMode: (enabled) =>
		set((state) => ({
			isMultiSelectMode: enabled && state.selectedIds.size > 0,
		})),
}))
