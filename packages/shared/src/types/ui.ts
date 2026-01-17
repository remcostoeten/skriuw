import { ReactNode } from 'react'

export type PaneHeaderProps = {
    paneId: string
    noteId: string | null
    isActive: boolean
    isPrimary: boolean
    onNoteSelect: (paneId: string, noteId: string) => void
    onClose?: () => void
}

export type AppLayoutShellProps = {
    leftToolbar?: ReactNode
    sidebar: ReactNode
    sidebarVisible?: boolean
    topToolbar: ReactNode
    mainContent: ReactNode
    footer: ReactNode
    rightPanel: ReactNode
    floatingWidgets: ReactNode
    isRightPanelOpen: boolean
    isTaskPanelOpen?: boolean
    isSidebarOpen: boolean
    isDesktopSidebarOpen: boolean
    onSidebarClose?: () => void
    onSidebarOpen?: () => void
}

export type EditorGestureCallbacks = {
    onPullDown?: () => void
    onDoubleTap?: () => void
    onLongPress?: (element: HTMLElement) => void
    onSwipeLeft?: () => void
    onSwipeRight?: () => void
}
