import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { 
  SidebarConfig, 
  SidebarSection,
  FavoriteItem, 
  RecentItem, 
  Project,
  DEFAULT_SIDEBAR_CONFIG,
  PROJECT_COLORS,
} from './types';

type SidebarState = {
  config: SidebarConfig;
  isLoading: boolean;

  getSections: () => SidebarSection[];
  toggleSectionCollapse: (sectionId: string) => void;
  toggleSectionVisibility: (sectionId: string) => void;
  reorderSections: (sectionIds: string[]) => void;
  addCustomSection: (name: string) => void;
  removeSection: (sectionId: string) => void;
  renameSection: (sectionId: string, name: string) => void;

  // Favorites
  addToFavorites: (itemId: string, itemType: 'file' | 'folder') => void;
  removeFromFavorites: (itemId: string) => void;
  isFavorite: (itemId: string) => boolean;

  // Recents
  addToRecents: (itemId: string, itemType: 'file' | 'folder') => void;
  clearRecents: () => void;
  getRecents: () => RecentItem[];

  // Projects
  createProject: (name: string, color?: string) => Project;
  updateProject: (projectId: string, updates: Partial<Project>) => void;
  deleteProject: (projectId: string) => void;
  addToProject: (projectId: string, itemId: string, itemType: 'file' | 'folder') => void;
  removeFromProject: (projectId: string, itemId: string, itemType: 'file' | 'folder') => void;
  getProjects: () => Project[];
  getProjectById: (projectId: string) => Project | undefined;

  // Config
  setMaxRecents: (max: number) => void;
  toggleShowSectionHeaders: () => void;
  toggleCompactMode: () => void;
  resetToDefaults: () => void;
};

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set, get) => ({
      config: DEFAULT_SIDEBAR_CONFIG,
      isLoading: false,

      // Section management
      getSections: () => {
        return get().config.sections
          .filter((section) => section.isVisible)
          .toSorted((left, right) => left.order - right.order);
      },

      toggleSectionCollapse: (sectionId: string) => {
        set(state => ({
          config: {
            ...state.config,
            sections: state.config.sections.map(s =>
              s.id === sectionId ? { ...s, isCollapsed: !s.isCollapsed } : s
            ),
          },
        }));
      },

      toggleSectionVisibility: (sectionId: string) => {
        set(state => ({
          config: {
            ...state.config,
            sections: state.config.sections.map(s =>
              s.id === sectionId ? { ...s, isVisible: !s.isVisible } : s
            ),
          },
        }));
      },

      reorderSections: (sectionIds: string[]) => {
        set(state => ({
          config: {
            ...state.config,
            sections: state.config.sections.map(s => ({
              ...s,
              order: sectionIds.indexOf(s.id),
            })),
          },
        }));
      },

      addCustomSection: (name: string) => {
        const newSection: SidebarSection = {
          id: `custom-${crypto.randomUUID()}`,
          type: 'custom',
          name,
          isCollapsed: false,
          isVisible: true,
          order: get().config.sections.length,
        };
        set(state => ({
          config: {
            ...state.config,
            sections: [...state.config.sections, newSection],
          },
        }));
      },

      removeSection: (sectionId: string) => {
        // Only allow removing custom sections
        const section = get().config.sections.find(s => s.id === sectionId);
        if (section?.type !== 'custom') return;
        
        set(state => ({
          config: {
            ...state.config,
            sections: state.config.sections.filter(s => s.id !== sectionId),
          },
        }));
      },

      renameSection: (sectionId: string, name: string) => {
        set(state => ({
          config: {
            ...state.config,
            sections: state.config.sections.map(s =>
              s.id === sectionId ? { ...s, name } : s
            ),
          },
        }));
      },

      // Favorites
      addToFavorites: (itemId: string, itemType: 'file' | 'folder') => {
        const existing = get().config.favorites.find(f => f.itemId === itemId);
        if (existing) return;

        const newFavorite: FavoriteItem = {
          id: crypto.randomUUID(),
          itemId,
          itemType,
          addedAt: new Date(),
        };
        set(state => ({
          config: {
            ...state.config,
            favorites: [...state.config.favorites, newFavorite],
          },
        }));
      },

      removeFromFavorites: (itemId: string) => {
        set(state => ({
          config: {
            ...state.config,
            favorites: state.config.favorites.filter(f => f.itemId !== itemId),
          },
        }));
      },

      isFavorite: (itemId: string) => {
        return get().config.favorites.some(f => f.itemId === itemId);
      },

      // Recents
      addToRecents: (itemId: string, itemType: 'file' | 'folder') => {
        const { maxRecents } = get().config;
        
        set(state => {
          // Remove existing entry for this item
          const filtered = state.config.recents.filter(r => r.itemId !== itemId);
          
          const newRecent: RecentItem = {
            id: crypto.randomUUID(),
            itemId,
            itemType,
            accessedAt: new Date(),
          };
          
          // Add to front and limit to maxRecents
          return {
            config: {
              ...state.config,
              recents: [newRecent, ...filtered].slice(0, maxRecents),
            },
          };
        });
      },

      clearRecents: () => {
        set(state => ({
          config: {
            ...state.config,
            recents: [],
          },
        }));
      },

      getRecents: () => {
        return get().config.recents;
      },

      // Projects
      createProject: (name: string, color?: string) => {
        const newProject: Project = {
          id: crypto.randomUUID(),
          name,
          color: color || PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)].value,
          fileIds: [],
          folderIds: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        set(state => ({
          config: {
            ...state.config,
            projects: [...state.config.projects, newProject],
          },
        }));
        return newProject;
      },

      updateProject: (projectId: string, updates: Partial<Project>) => {
        set(state => ({
          config: {
            ...state.config,
            projects: state.config.projects.map(p =>
              p.id === projectId ? { ...p, ...updates, updatedAt: new Date() } : p
            ),
          },
        }));
      },

      deleteProject: (projectId: string) => {
        set(state => ({
          config: {
            ...state.config,
            projects: state.config.projects.filter(p => p.id !== projectId),
          },
        }));
      },

      addToProject: (projectId: string, itemId: string, itemType: 'file' | 'folder') => {
        set(state => ({
          config: {
            ...state.config,
            projects: state.config.projects.map(p => {
              if (p.id !== projectId) return p;
              if (itemType === 'file') {
                if (p.fileIds.includes(itemId)) return p;
                return { ...p, fileIds: [...p.fileIds, itemId], updatedAt: new Date() };
              } else {
                if (p.folderIds.includes(itemId)) return p;
                return { ...p, folderIds: [...p.folderIds, itemId], updatedAt: new Date() };
              }
            }),
          },
        }));
      },

      removeFromProject: (projectId: string, itemId: string, itemType: 'file' | 'folder') => {
        set(state => ({
          config: {
            ...state.config,
            projects: state.config.projects.map(p => {
              if (p.id !== projectId) return p;
              if (itemType === 'file') {
                return { ...p, fileIds: p.fileIds.filter(id => id !== itemId), updatedAt: new Date() };
              } else {
                return { ...p, folderIds: p.folderIds.filter(id => id !== itemId), updatedAt: new Date() };
              }
            }),
          },
        }));
      },

      getProjects: () => {
        return get().config.projects;
      },

      getProjectById: (projectId: string) => {
        return get().config.projects.find(p => p.id === projectId);
      },

      // Config
      setMaxRecents: (max: number) => {
        set(state => ({
          config: {
            ...state.config,
            maxRecents: max,
            recents: state.config.recents.slice(0, max),
          },
        }));
      },

      toggleShowSectionHeaders: () => {
        set(state => ({
          config: {
            ...state.config,
            showSectionHeaders: !state.config.showSectionHeaders,
          },
        }));
      },

      toggleCompactMode: () => {
        set(state => ({
          config: {
            ...state.config,
            compactMode: !state.config.compactMode,
          },
        }));
      },

      resetToDefaults: () => {
        set({ config: DEFAULT_SIDEBAR_CONFIG });
      },
    }),
    {
      name: 'haptic-sidebar',
      partialize: (state) => ({ config: state.config }),
    }
  )
);
