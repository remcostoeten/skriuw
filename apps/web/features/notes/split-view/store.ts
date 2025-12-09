'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

import { generateId } from '@skriuw/core-logic/generate-id'

export type SplitOrientation = 'single' | 'vertical' | 'horizontal'

export type SplitPaneState = {
	id: string
	noteId: string | null
	scrollTop: number
	editorKey: string
}

type SplitNoteLayout = {
	orientation: SplitOrientation
	sizes: number[]
}

type SplitViewState = {
	panes: SplitPaneState[]
	activePaneId: string
	orientation: SplitOrientation
	sizes: number[]
	layoutByNoteId: Record<string, SplitNoteLayout>
	currentNoteId: string | null
	toggleSplit: (noteId: string | null) => void
	openSplitWithNote: (noteId: string | null) => string | null
	closePane: (paneId: string) => void
	closeActivePane: () => void
	setActivePane: (paneId: string) => void
	updatePaneNote: (paneId: string, noteId: string | null) => void
	updatePaneScroll: (paneId: string, scrollTop: number) => void
	setOrientation: (orientation: SplitOrientation, noteId?: string | null) => void
	cycleOrientation: (noteId: string | null) => void
	swapPanes: () => void
	setSizes: (sizes: number[]) => void
	ensurePrimaryPane: (noteId: string | null) => void
	focusPaneByIndex: (index: number) => void
	setCurrentNoteId: (noteId: string | null) => void
	reset: () => void
}

const STORAGE_KEY = 'skriuw:noteSplitView:state'

const MIN_PANE_SIZE = 0.15

const createPane = (noteId: string | null = null): SplitPaneState => ({
	id: generateId('pane-'),
	noteId,
	scrollTop: 0,
	editorKey: generateId('editor-'),
})

const normalizeSizes = (sizes: number[]): number[] => {
	if (!sizes.length) return [1]
	const clamped = sizes.map((size) => Math.max(size, MIN_PANE_SIZE))
	const total = clamped.reduce((sum, size) => sum + size, 0)
	if (!total) {
		return new Array(sizes.length).fill(1 / sizes.length)
	}
	return clamped.map((size) => Number((size / total).toFixed(4)))
}

const ensureTwoPanes = (panes: SplitPaneState[], noteId: string | null): SplitPaneState[] => {
	if (panes.length >= 2) {
		return panes
	}
	const base = noteId ?? panes[0]?.noteId ?? null
	if (!panes.length) {
		const first = createPane(base)
		const second = createPane(base)
		return [first, second]
	}
	const [first] = panes
	const updatedFirst: SplitPaneState = {
		...first,
		noteId: base,
	}
	return [updatedFirst, createPane(base)]
}

const defaultLayout: SplitNoteLayout = {
	orientation: 'single',
	sizes: [1],
}

const withLayoutPersistence = (
	state: SplitViewState,
	partial: Partial<SplitViewState>
): Partial<SplitViewState> => {
	if (!state.currentNoteId) {
		return partial
	}
	const orientation = partial.orientation ?? state.orientation
	const sizes = partial.sizes ?? state.sizes
	return {
		...partial,
		layoutByNoteId: {
			...state.layoutByNoteId,
			[state.currentNoteId]: {
				orientation,
				sizes,
			},
		},
	}
}

const safeStorage = () => {
	if (typeof window === 'undefined') {
		const noopStorage: Storage = {
			length: 0,
			clear: () => { },
			getItem: () => null,
			key: () => null,
			removeItem: () => { },
			setItem: () => { },
		}
		return noopStorage
	}
	return window.localStorage
}

const initialPane = createPane(null)

export const useSplitViewStore = create<SplitViewState>()(
	persist(
		(set, get) => ({
			panes: [initialPane],
			activePaneId: initialPane.id,
			orientation: 'single',
			sizes: [1],
			layoutByNoteId: {},
			currentNoteId: null,
			toggleSplit: (noteId) =>
				set((state) => {
					if (state.panes.length > 1) {
						const firstPane: SplitPaneState = {
							...(state.panes[0] ?? createPane(noteId)),
							noteId: noteId ?? state.panes[0]?.noteId ?? null,
						}
						return withLayoutPersistence(state, {
							panes: [firstPane],
							activePaneId: firstPane.id,
							orientation: 'single',
							sizes: [1],
						})
					}

					const base = noteId ?? state.panes[0]?.noteId ?? null
					const first = state.panes[0]
						? { ...state.panes[0], noteId: base }
						: createPane(base)
					const second = createPane(base)

					return withLayoutPersistence(state, {
						panes: [first, second],
						activePaneId: second.id,
						orientation: state.orientation === 'horizontal' ? 'horizontal' : 'vertical',
						sizes: normalizeSizes([0.5, 0.5]),
					})
				}),
			openSplitWithNote: (noteId) => {
				let newPaneId: string | null = null
				set((state) => {
					if (state.panes.length > 1) {
						newPaneId = state.panes[1]?.id ?? null
						return state
					}
					const base = noteId ?? state.panes[0]?.noteId ?? null
					const first = state.panes[0]
						? { ...state.panes[0], noteId: base }
						: createPane(base)
					const second = createPane(noteId ?? base)
					newPaneId = second.id
					return withLayoutPersistence(state, {
						panes: [first, second],
						activePaneId: second.id,
						orientation: state.orientation === 'horizontal' ? 'horizontal' : 'vertical',
						sizes: normalizeSizes([0.5, 0.5]),
					})
				})
				return newPaneId
			},
			closePane: (paneId) =>
				set((state) => {
					if (state.panes.length <= 1) {
						return withLayoutPersistence(state, {
							panes: state.panes.length
								? [{ ...state.panes[0], noteId: state.panes[0].noteId }]
								: [createPane(null)],
							activePaneId: state.panes[0]?.id ?? paneId,
							orientation: 'single',
							sizes: [1],
						})
					}
					const remaining = state.panes.filter((pane) => pane.id !== paneId)
					const fallback = remaining[0] ?? remaining[remaining.length - 1]
					return withLayoutPersistence(state, {
						panes: remaining.map((pane) => ({ ...pane })),
						activePaneId: fallback.id,
						orientation: remaining.length > 1 ? state.orientation : 'single',
						sizes: remaining.length > 1 ? normalizeSizes([0.5, 0.5]) : [1],
					})
				}),
			closeActivePane: () => {
				const { activePaneId } = get()
				if (!activePaneId) return
				get().closePane(activePaneId)
			},
			setActivePane: (paneId) =>
				set((state) => {
					if (state.activePaneId === paneId) {
						return state
					}
					const exists = state.panes.some((pane) => pane.id === paneId)
					if (!exists) return state
					return { ...state, activePaneId: paneId }
				}),
			updatePaneNote: (paneId, noteId) =>
				set((state) => ({
					panes: state.panes.map((pane) =>
						pane.id === paneId ? { ...pane, noteId, editorKey: generateId('editor-') } : pane
					),
				})),
			updatePaneScroll: (paneId, scrollTop) =>
				set((state) => ({
					panes: state.panes.map((pane) =>
						pane.id === paneId ? { ...pane, scrollTop } : pane
					),
				})),
			setOrientation: (orientation, noteId) =>
				set((state) => {
					if (orientation === 'single') {
						const firstPane = state.panes[0] as unknown as SplitPaneState | undefined
						const existingNoteId = firstPane ? firstPane.noteId : null
						const first = firstPane ?? createPane(noteId ?? existingNoteId ?? null)
						return withLayoutPersistence(state, {
							panes: [{ ...first }],
							activePaneId: first.id,
							orientation: 'single',
							sizes: [1],
						})
					}
					const panes = ensureTwoPanes(state.panes, noteId ?? state.panes[0]?.noteId ?? null)
					return withLayoutPersistence(state, {
						panes,
						activePaneId: state.activePaneId || panes[0].id,
						orientation,
						sizes: normalizeSizes(state.sizes.length === 2 ? state.sizes : [0.5, 0.5]),
					})
				}),
			cycleOrientation: (noteId) =>
				set((state) => {
					const order: SplitOrientation[] = ['single', 'vertical', 'horizontal']
					const currentIndex = order.indexOf(state.orientation)
					const nextOrientation = order[(currentIndex + 1) % order.length]
					if (nextOrientation === 'single') {
						const firstPane = state.panes[0] as unknown as SplitPaneState | undefined
						const existingNoteId = firstPane ? firstPane.noteId : null
						const first = firstPane ?? createPane(noteId ?? existingNoteId ?? null)
						return withLayoutPersistence(state, {
							panes: [{ ...first }],
							activePaneId: first.id,
							orientation: 'single',
							sizes: [1],
						})
					}
					const panes = ensureTwoPanes(state.panes, noteId ?? state.panes[0]?.noteId ?? null)
					return withLayoutPersistence(state, {
						panes,
						activePaneId: state.activePaneId || panes[0].id,
						orientation: nextOrientation,
						sizes: normalizeSizes(state.sizes.length === 2 ? state.sizes : [0.5, 0.5]),
					})
				}),
			swapPanes: () =>
				set((state) => {
					if (state.panes.length < 2) {
						return state
					}
					const swapped = [state.panes[1], state.panes[0]]
					const activePaneId =
						state.activePaneId === state.panes[0].id ? swapped[0].id : swapped[1].id
					return withLayoutPersistence(state, {
						panes: swapped.map((pane) => ({ ...pane })),
						activePaneId,
						sizes: [...state.sizes].reverse(),
					})
				}),
			setSizes: (sizes) =>
				set((state) =>
					withLayoutPersistence(state, {
						sizes: normalizeSizes(sizes.slice(0, state.panes.length)),
					})
				),
			ensurePrimaryPane: (noteId) =>
				set((state) => {
					if (!state.panes.length) {
						const pane = createPane(noteId)
						return {
							panes: [pane],
							activePaneId: pane.id,
							orientation: 'single',
							sizes: [1],
						}
					}
					const first = state.panes[0]
					const needsUpdate = noteId && first.noteId !== noteId && state.orientation === 'single'
					if (!needsUpdate) {
						return state.activePaneId ? state : { ...state, activePaneId: first.id }
					}
					return {
						...state,
						panes: [{ ...first, noteId }, ...state.panes.slice(1)],
						activePaneId: state.activePaneId || first.id,
					}
				}),
			focusPaneByIndex: (index) =>
				set((state) => {
					if (index < 0 || index >= state.panes.length) {
						return state
					}
					return { ...state, activePaneId: state.panes[index].id }
				}),
			setCurrentNoteId: (noteId) =>
				set((state) => {
					if (state.currentNoteId === noteId) {
						return state
					}

					const updatedLayouts: Record<string, SplitNoteLayout> = { ...state.layoutByNoteId }
					if (state.currentNoteId) {
						updatedLayouts[state.currentNoteId] = {
							orientation: state.orientation,
							sizes: state.sizes,
						}
					}

					let panes = state.panes.map((pane) => ({ ...pane }))
					let orientation = state.orientation
					let sizes = state.sizes
					let activePaneId = state.activePaneId

					if (noteId) {
						const storedLayout = updatedLayouts[noteId]
						if (storedLayout) {
							orientation = storedLayout.orientation
							if (storedLayout.orientation === 'single') {
								const first = panes[0] ?? createPane(noteId)
								const normalizedFirst = { ...first, noteId }
								panes = [normalizedFirst]
								activePaneId = normalizedFirst.id
								sizes = [1]
							} else {
								const ensured = ensureTwoPanes(panes, noteId).map((pane) => ({ ...pane }))
								panes = ensured
								sizes = normalizeSizes(
									storedLayout.sizes.length === panes.length
										? storedLayout.sizes
										: storedLayout.sizes.slice(0, panes.length)
								)
								if (!panes.some((pane) => pane.id === activePaneId)) {
									activePaneId = panes[0].id
								}
							}
						} else {
							const first = panes[0] ?? createPane(noteId)
							const normalizedFirst = { ...first, noteId }
							panes = [normalizedFirst]
							activePaneId = normalizedFirst.id
							orientation = 'single'
							sizes = [1]
						}
					}

					return {
						panes,
						orientation,
						sizes,
						activePaneId,
						currentNoteId: noteId,
						layoutByNoteId: updatedLayouts,
					}
				}),
			reset: () =>
				set(() => {
					const pane = createPane(null)
					return {
						panes: [pane],
						activePaneId: pane.id,
						orientation: 'single',
						sizes: [1],
					}
				}),
		}),
		{
			name: STORAGE_KEY,
			storage: createJSONStorage(safeStorage),
			partialize: (state) => ({
				panes: state.panes,
				activePaneId: state.activePaneId,
				orientation: state.orientation,
				sizes: state.sizes,
				layoutByNoteId: state.layoutByNoteId,
				currentNoteId: state.currentNoteId,
			}),
		}
	)
)
