export type EditorTab = {
  noteId: string
  title: string
  lastVisitedAt: number
}

export type EditorTabInput = {
  noteId: string
  title?: string
}

export type EditorTabsContextValue = {
  tabs: EditorTab[]
  activeNoteId: string | null
  openTab: (tab: EditorTabInput, options?: { activate?: boolean }) => void
  closeTab: (noteId: string) => string | null
  closeOtherTabs: (noteId: string) => void
  closeTabsToRight: (noteId: string) => void
  closeTabsToLeft: (noteId: string) => void
  setActiveTab: (noteId: string | null) => void
  clearTabs: () => void
  pruneTabs: (validIds: Set<string>) => void
  reorderTabs: (fromIndex: number, toIndex: number) => void
  moveTabLeft: (noteId: string) => void
  moveTabRight: (noteId: string) => void
}
