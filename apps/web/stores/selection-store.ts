'use client'

import { create } from "zustand";

type props = {
	selectedIds: string[]
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
	selectedIds: [],
	isMultiSelectMode: false,
	anchorId: null,
	lastSelectedId: null,

	selectItem: (id) =>
		set((state) => {
			const selectedIds = state.selectedIds.includes(id)
				? state.selectedIds
				: [...state.selectedIds, id]
			return {
				selectedIds,
				isMultiSelectMode: true,
				lastSelectedId: id
			}
		}),

	deselectItem: (id) =>
		set((state) => {
			const selectedIds = state.selectedIds.filter((selectedId) => selectedId !== id)
			return {
				selectedIds,
				isMultiSelectMode: selectedIds.length > 0
			}
		}),

	toggleSelection: (id) =>
		set((state) => {
			const isSelected = state.selectedIds.includes(id)
			const selectedIds = isSelected
				? state.selectedIds.filter((selectedId) => selectedId !== id)
				: [...state.selectedIds, id]
			return {
				selectedIds,
				isMultiSelectMode: selectedIds.length > 0,
				lastSelectedId: !isSelected ? id : state.lastSelectedId
			}
		}),

	selectAll: (ids) =>
		set({
			selectedIds: [...ids],
			isMultiSelectMode: true
		}),

	clearSelection: () =>
		set({
			selectedIds: [],
			isMultiSelectMode: false,
			anchorId: null,
			lastSelectedId: null
		}),

	setAnchor: (id) =>
		set({
			anchorId: id,
			lastSelectedId: id,
			selectedIds: [id],
			isMultiSelectMode: true
		}),

	selectRange: (fromId, toId, itemIds) => {
		const range = get().getRangeBetween(fromId, toId, itemIds)
		set({
			selectedIds: range,
			lastSelectedId: toId,
			isMultiSelectMode: true
		})
	},

	clearAnchor: () =>
		set({
			anchorId: null,
			lastSelectedId: null
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

	isSelected: (id) => get().selectedIds.includes(id),
	getSelectedCount: () => get().selectedIds.length,
	getSelectedIds: () => get().selectedIds,

	setMultiSelectMode: (enabled) =>
		set((state) => ({
			isMultiSelectMode: enabled && state.selectedIds.length > 0
		}))
}))
