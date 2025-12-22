// Enhanced app store for better Tauri compatibility
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

type PageType = 'notes' | 'archive' | 'trash' | 'tasks' | 'settings'

type AppState = {
  // UI State
  isDesktopSidebarOpen: boolean
  isMobileSidebarOpen: boolean
  isSettingsOpen: boolean
  
  // Navigation State
  currentPage: PageType
  activeNoteId: string | null
  hasActiveEditor: boolean
  
  // Computed getters
  showSidebar: boolean
  showEditorControls: boolean
  
  // Actions
  toggleDesktopSidebar: () => void
  toggleMobileSidebar: () => void
  setActiveNote: (id: string | null) => void
  setCurrentPage: (page: PageType) => void
}

function safeStorage() {
  if (typeof window === 'undefined') {
    const noopStorage: Storage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    }
    return noopStorage
  }
  return window.localStorage
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // UI State
      isDesktopSidebarOpen: true,
      isMobileSidebarOpen: false,
      isSettingsOpen: false,
      
      // Navigation State
      currentPage: 'notes',
      activeNoteId: null,
      hasActiveEditor: false,
      
      // Computed getters
      get showSidebar() {
        const page = get().currentPage
        return page !== 'archive' && page !== 'trash'
      },
      
      get showEditorControls() {
        return !!get().activeNoteId && get().hasActiveEditor
      },
      
      // Actions
      toggleDesktopSidebar: () =>
        set((state) => ({
          isDesktopSidebarOpen: !state.isDesktopSidebarOpen,
        })),
        
      toggleMobileSidebar: () =>
        set((state) => ({
          isMobileSidebarOpen: !state.isMobileSidebarOpen,
        })),
        
      setActiveNote: (id) =>
        set({
          activeNoteId: id,
          hasActiveEditor: !!id,
        }),
        
      setCurrentPage: (page) =>
        set({
          currentPage: page,
          // Reset editor state when leaving notes
          activeNoteId: page === 'notes' ? get().activeNoteId : null,
          hasActiveEditor: page === 'notes' ? get().hasActiveEditor : false,
        }),
    }),
    {
      name: 'app-storage',
      partialize: (state) => ({
        isDesktopSidebarOpen: state.isDesktopSidebarOpen,
        currentPage: state.currentPage,
      }),
      storage: createJSONStorage(safeStorage),
    }
  )
)
