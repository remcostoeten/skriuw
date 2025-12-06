'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

type UIState = {
	isDesktopSidebarOpen: boolean
	toggleDesktopSidebar: () => void
	setDesktopSidebarOpen: (open: boolean) => void

	isMobileSidebarOpen: boolean
	toggleMobileSidebar: () => void
	setMobileSidebarOpen: (open: boolean) => void

	isShortcutsSidebarOpen: boolean
	toggleShortcutsSidebar: () => void
	setShortcutsSidebarOpen: (open: boolean) => void

	isSettingsOpen: boolean
	toggleSettings: () => void
	setSettingsOpen: (open: boolean) => void

	activeTaskId: string | null
	setActiveTask: (taskId: string | null) => void
	openTaskPanel: (taskId: string) => void
}

const safeStorage = () => {
	if (typeof window === 'undefined') {
		const noopStorage: Storage = {
			getItem: () => null,
			setItem: () => { },
			removeItem: () => { },
			clear: () => { },
			key: () => null,
			length: 0,
		}
		return noopStorage
	}

	return window.localStorage
}

export const useUIStore = create<UIState>()(
	persist(
		(set) => ({
			isDesktopSidebarOpen: true,
			toggleDesktopSidebar: () =>
				set((state) => ({
					isDesktopSidebarOpen: !state.isDesktopSidebarOpen,
				})),
			setDesktopSidebarOpen: (open) => set({ isDesktopSidebarOpen: open }),

			isMobileSidebarOpen: false,
			toggleMobileSidebar: () =>
				set((state) => ({
					isMobileSidebarOpen: !state.isMobileSidebarOpen,
				})),
			setMobileSidebarOpen: (open) => set({ isMobileSidebarOpen: open }),

			isShortcutsSidebarOpen: false,
			toggleShortcutsSidebar: () =>
				set((state) => ({
					isShortcutsSidebarOpen: !state.isShortcutsSidebarOpen,
				})),
			setShortcutsSidebarOpen: (open) => set({ isShortcutsSidebarOpen: open }),

			isSettingsOpen: false,
			toggleSettings: () =>
				set((state) => ({
					isSettingsOpen: !state.isSettingsOpen,
				})),
			setSettingsOpen: (open) => set({ isSettingsOpen: open }),

			// Task Side Panel
			activeTaskId: null,
			setActiveTask: (taskId) => set({ activeTaskId: taskId }),
			openTaskPanel: (taskId) => set({ activeTaskId: taskId, isShortcutsSidebarOpen: false }),
		}),
		{
			name: 'ui-storage',
			partialize: (state) => ({
				isDesktopSidebarOpen: state.isDesktopSidebarOpen,
			}),
			storage: createJSONStorage(safeStorage),
		}
	)
)
