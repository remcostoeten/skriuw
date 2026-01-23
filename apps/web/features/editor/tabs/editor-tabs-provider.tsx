import type { EditorTab, EditorTabInput, EditorTabsContextValue } from "./types";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const STORAGE_KEY = 'skriuw_editor_tabs_state'
const MAX_TABS = 12

type PersistedState = {
	tabs: EditorTab[]
	activeNoteId: string | null
}

const createDefaultState = (): PersistedState => ({
	tabs: [],
	activeNoteId: null
})

function readPersistedState(): PersistedState {
	if (typeof window === 'undefined') {
		return createDefaultState()
	}

	try {
		const raw = window.localStorage.getItem(STORAGE_KEY)
		if (!raw) return createDefaultState()
		const parsed = JSON.parse(raw) as PersistedState
		const deduped = Array.isArray(parsed.tabs)
			? parsed.tabs.reduce<EditorTab[]>((acc, tab) => {
					if (!tab?.noteId) return acc
					if (acc.some((existing) => existing.noteId === tab.noteId)) {
						return acc
					}
					acc.push({
						noteId: tab.noteId,
						title: tab.title ?? 'Untitled',
						lastVisitedAt: tab.lastVisitedAt ?? Date.now()
					})
					return acc
				}, [])
			: []
		return {
			tabs: deduped.slice(-MAX_TABS),
			activeNoteId: parsed.activeNoteId ?? null
		}
	} catch {
		return createDefaultState()
	}
}

function persistState(state: PersistedState) {
	if (typeof window === 'undefined') return
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
	} catch {
		// ignore persistence errors for privacy mode or quota issues
	}
}

const EditorTabsContext = createContext<EditorTabsContextValue | null>(null)

type EditorTabsProviderProps = {
	children: ReactNode
}

export function EditorTabsProvider({ children }: EditorTabsProviderProps) {
	// Read persisted state only once to ensure consistent hydration
	const [{ tabs: initialTabs, activeNoteId: initialActiveNoteId }] = useState(() =>
		readPersistedState()
	)
	const [tabs, setTabs] = useState<EditorTab[]>(initialTabs)
	const [activeNoteId, setActiveNoteId] = useState<string | null>(initialActiveNoteId)

	useEffect(() => {
		persistState({ tabs, activeNoteId })
	}, [tabs, activeNoteId])

	const setActiveTab = useCallback((noteId: string | null) => {
		setActiveNoteId(noteId)
	}, [])

	const openTab = useCallback(
		(tab: EditorTabInput, options: { activate?: boolean } = { activate: true }) => {
			if (!tab.noteId) return
			setTabs((prev) => {
				const nextTitle =
					tab.title?.trim() ||
					prev.find((t) => t.noteId === tab.noteId)?.title ||
					'Untitled'
				const existingIndex = prev.findIndex((t) => t.noteId === tab.noteId)
				const nextTab: EditorTab = {
					noteId: tab.noteId,
					title: nextTitle,
					lastVisitedAt: Date.now()
				}
				if (existingIndex >= 0) {
					const updated = [...prev]
					updated[existingIndex] = nextTab
					return updated
				}
				const limited = [...prev, nextTab]
				if (limited.length > MAX_TABS) {
					limited.shift()
				}
				return limited
			})

			if (options.activate !== false) {
				setActiveTab(tab.noteId)
			}
		},
		[setActiveTab]
	)

	const closeTab = useCallback((noteId: string) => {
		let fallbackId: string | null = null
		setTabs((prev) => {
			const index = prev.findIndex((tab) => tab.noteId === noteId)
			if (index === -1) {
				return prev
			}
			const remaining = prev.filter((tab) => tab.noteId !== noteId)
			const candidate = remaining[index] ?? remaining[index - 1] ?? remaining[0]
			fallbackId = candidate?.noteId ?? null
			setActiveNoteId((current) => (current === noteId ? fallbackId : current))
			return remaining
		})
		return fallbackId
	}, [])

	const closeOtherTabs = useCallback(
		(noteId: string) => {
			setTabs((prev) => prev.filter((tab) => tab.noteId === noteId))
			setActiveTab(noteId)
		},
		[setActiveTab]
	)

	const closeTabsToRight = useCallback((noteId: string) => {
		setTabs((prev) => {
			const index = prev.findIndex((tab) => tab.noteId === noteId)
			if (index === -1) return prev
			return prev.slice(0, index + 1)
		})
	}, [])

	const closeTabsToLeft = useCallback((noteId: string) => {
		setTabs((prev) => {
			const index = prev.findIndex((tab) => tab.noteId === noteId)
			if (index === -1) return prev
			return prev.slice(index)
		})
	}, [])

	const moveTabLeft = useCallback((noteId: string) => {
		setTabs((prev) => {
			const index = prev.findIndex((tab) => tab.noteId === noteId)
			if (index <= 0) return prev
			const newTabs = [...prev]
			const [moved] = newTabs.splice(index, 1)
			newTabs.splice(index - 1, 0, moved)
			return newTabs
		})
	}, [])

	const moveTabRight = useCallback((noteId: string) => {
		setTabs((prev) => {
			const index = prev.findIndex((tab) => tab.noteId === noteId)
			if (index === -1 || index >= prev.length - 1) return prev
			const newTabs = [...prev]
			const [moved] = newTabs.splice(index, 1)
			newTabs.splice(index + 1, 0, moved)
			return newTabs
		})
	}, [])

	const clearTabs = useCallback(() => {
		setTabs([])
		setActiveNoteId(null)
	}, [])

	const pruneTabs = useCallback(
		(validIds: Set<string>) => {
			if (!validIds.size) {
				return
			}
			setTabs((prev) => {
				const filtered = prev.filter((tab) => validIds.has(tab.noteId))
				if (filtered.length === prev.length) {
					return prev
				}
				if (activeNoteId && !validIds.has(activeNoteId)) {
					const fallback =
						filtered[filtered.length - 1]?.noteId ?? filtered[0]?.noteId ?? null
					setActiveNoteId(fallback)
				}
				return filtered
			})
		},
		[activeNoteId]
	)

	const reorderTabs = useCallback((fromIndex: number, toIndex: number) => {
		setTabs((prev) => {
			if (
				fromIndex === toIndex ||
				fromIndex < 0 ||
				toIndex < 0 ||
				fromIndex >= prev.length ||
				toIndex >= prev.length
			) {
				return prev
			}
			const newTabs = [...prev]
			const [moved] = newTabs.splice(fromIndex, 1)
			newTabs.splice(toIndex, 0, moved)
			return newTabs
		})
	}, [])

	const value = useMemo<EditorTabsContextValue>(
		() => ({
			tabs,
			activeNoteId,
			openTab,
			closeTab,
			closeOtherTabs,
			closeTabsToRight,
			closeTabsToLeft,
			setActiveTab,
			clearTabs,
			pruneTabs,
			reorderTabs,
			moveTabLeft,
			moveTabRight
		}),
		[
			tabs,
			activeNoteId,
			openTab,
			closeTab,
			closeOtherTabs,
			closeTabsToRight,
			closeTabsToLeft,
			setActiveTab,
			clearTabs,
			pruneTabs,
			reorderTabs,
			moveTabLeft,
			moveTabRight
		]
	)

	return <EditorTabsContext.Provider value={value}>{children}</EditorTabsContext.Provider>
}

export function useEditorTabsContext() {
	const context = useContext(EditorTabsContext)
	if (!context) {
		throw new Error('useEditorTabsContext must be used within an EditorTabsProvider')
	}
	return context
}
