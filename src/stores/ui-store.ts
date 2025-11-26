import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UIState {
    // Desktop sidebar (file tree)
    isDesktopSidebarOpen: boolean
    toggleDesktopSidebar: () => void
    setDesktopSidebarOpen: (open: boolean) => void

    // Mobile sidebar (navigation menu)
    isMobileSidebarOpen: boolean
    toggleMobileSidebar: () => void
    setMobileSidebarOpen: (open: boolean) => void

    // Shortcuts sidebar (right panel)
    isShortcutsSidebarOpen: boolean
    toggleShortcutsSidebar: () => void
    setShortcutsSidebarOpen: (open: boolean) => void

    // Settings modal
    isSettingsOpen: boolean
    toggleSettings: () => void
    setSettingsOpen: (open: boolean) => void

    // Storage status panel
    isStorageStatusOpen: boolean
    toggleStorageStatus: () => void
    setStorageStatusOpen: (open: boolean) => void
}

export const useUIStore = create<UIState>()(
    persist(
        (set) => ({
            // Desktop sidebar (file tree) - default open on desktop
            isDesktopSidebarOpen: true,
            toggleDesktopSidebar: () =>
                set((state) => ({
                    isDesktopSidebarOpen: !state.isDesktopSidebarOpen,
                })),
            setDesktopSidebarOpen: (open) => set({ isDesktopSidebarOpen: open }),

            // Mobile sidebar (navigation menu) - default closed on mobile
            isMobileSidebarOpen: false,
            toggleMobileSidebar: () =>
                set((state) => ({
                    isMobileSidebarOpen: !state.isMobileSidebarOpen,
                })),
            setMobileSidebarOpen: (open) => set({ isMobileSidebarOpen: open }),

            // Shortcuts sidebar (right panel) - default closed
            isShortcutsSidebarOpen: false,
            toggleShortcutsSidebar: () =>
                set((state) => ({
                    isShortcutsSidebarOpen: !state.isShortcutsSidebarOpen,
                })),
            setShortcutsSidebarOpen: (open) => set({ isShortcutsSidebarOpen: open }),

            // Settings modal - default closed
            isSettingsOpen: false,
            toggleSettings: () =>
                set((state) => ({
                    isSettingsOpen: !state.isSettingsOpen,
                })),
            setSettingsOpen: (open) => set({ isSettingsOpen: open }),

            // Storage status panel - default closed, read from localStorage
            isStorageStatusOpen: false,
            toggleStorageStatus: () =>
                set((state) => ({
                    isStorageStatusOpen: !state.isStorageStatusOpen,
                })),
            setStorageStatusOpen: (open) => set({ isStorageStatusOpen: open }),
        }),
        {
            name: 'ui-storage',
            partialize: (state) => ({
                isDesktopSidebarOpen: state.isDesktopSidebarOpen,
                isStorageStatusOpen: state.isStorageStatusOpen,
            }),
        }
    )
)