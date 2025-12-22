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

	isSettingsOpen: boolean
	toggleSettings: () => void
	setSettingsOpen: (open: boolean) => void

	// Task Side Panel - Stacked Navigation
	taskStack: string[] // Stack of task IDs for stacked panel navigation
	activeTaskId: string | null // Computed from stack (last item)
	setActiveTask: (taskId: string | null) => void
	openTaskPanel: (taskId: string) => void
	pushTask: (taskId: string) => void // Add task to stack (dive deeper)
	popTask: () => void // Remove last task (go back)
	closeAllTasks: () => void // Close all panels

	// Last Active Note Tracking
	lastActiveNoteId: string | null
	setLastActiveNote: (noteId: string | null) => void

	// Right Sidebar for Notes
	isRightSidebarOpen: boolean
	toggleRightSidebar: () => void
	setRightSidebarOpen: (open: boolean) => void
}

function safeStorage() {
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
		(set, get) => ({
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

			isSettingsOpen: false,
			toggleSettings: () =>
				set((state) => ({
					isSettingsOpen: !state.isSettingsOpen,
				})),
			setSettingsOpen: (open) => set({ isSettingsOpen: open }),

			// Task Side Panel - Stacked Navigation
			taskStack: [],
			get activeTaskId() {
				const stack = get().taskStack
				return stack.length > 0 ? stack[stack.length - 1] : null
			},
			setActiveTask: (taskId) => set({
				taskStack: taskId ? [taskId] : [],
			}),
			openTaskPanel: (taskId) => set({
				taskStack: [taskId],
			}),
			pushTask: (taskId) => set((state) => ({
				taskStack: [...state.taskStack, taskId],
			})),
			popTask: () => set((state) => ({
				taskStack: state.taskStack.slice(0, -1),
			})),
			closeAllTasks: () => set({ taskStack: [] }),

			// Last Active Note Tracking
			lastActiveNoteId: null,
			setLastActiveNote: (noteId) => set({ lastActiveNoteId: noteId }),

			// Right Sidebar for Notes
			isRightSidebarOpen: false,
			toggleRightSidebar: () =>
				set((state) => ({
					isRightSidebarOpen: !state.isRightSidebarOpen,
				})),
			setRightSidebarOpen: (open) => set({ isRightSidebarOpen: open }),
		}),
		{
			name: 'ui-storage',
			partialize: (state) => ({
				isDesktopSidebarOpen: state.isDesktopSidebarOpen,
				lastActiveNoteId: state.lastActiveNoteId,
			}),
			storage: createJSONStorage(safeStorage),
		}
	)
)
