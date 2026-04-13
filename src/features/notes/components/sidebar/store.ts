import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getAuthActorId } from "@/platform/auth";
import {
  DEFAULT_SIDEBAR_CONFIG,
  PROJECT_COLORS,
  type FavoriteItem,
  type Project,
  type RecentItem,
  type SidebarConfig,
  type SidebarSection,
} from "./types";

type SidebarState = {
  currentActorId: string;
  config: SidebarConfig;
  isLoading: boolean;
  isHydrated: boolean;
  profiles: Record<string, SidebarConfig>;

  syncActor: (actorId: string) => void;
  getSections: () => SidebarSection[];
  toggleSectionCollapse: (sectionId: string) => void;
  toggleSectionVisibility: (sectionId: string) => void;
  reorderSections: (sectionIds: string[]) => void;
  addCustomSection: (name: string) => void;
  removeSection: (sectionId: string) => void;
  renameSection: (sectionId: string, name: string) => void;
  addToCustomSection: (sectionId: string, itemId: string, itemType: "file" | "folder") => void;
  removeFromCustomSection: (sectionId: string, itemId: string, itemType: "file" | "folder") => void;

  addToFavorites: (itemId: string, itemType: "file" | "folder") => void;
  removeFromFavorites: (itemId: string) => void;
  isFavorite: (itemId: string) => boolean;

  addToRecents: (itemId: string, itemType: "file" | "folder") => void;
  clearRecents: () => void;
  getRecents: () => RecentItem[];

  createProject: (name: string, color?: string) => Project;
  updateProject: (projectId: string, updates: Partial<Project>) => void;
  deleteProject: (projectId: string) => void;
  addToProject: (projectId: string, itemId: string, itemType: "file" | "folder") => void;
  removeFromProject: (projectId: string, itemId: string, itemType: "file" | "folder") => void;
  getProjects: () => Project[];
  getProjectById: (projectId: string) => Project | undefined;

  setMaxRecents: (max: number) => void;
  toggleShowSectionHeaders: () => void;
  toggleCompactMode: () => void;
  resetToDefaults: () => void;
};

type PersistedSidebarState = {
  currentActorId?: string;
  profiles?: Record<string, SidebarConfig>;
  config?: SidebarConfig;
};

function cloneSidebarConfig(config: SidebarConfig = DEFAULT_SIDEBAR_CONFIG): SidebarConfig {
  return {
    sections: config.sections.map((section) => ({
      ...section,
      customConfig: section.customConfig
        ? {
            ...section.customConfig,
            fileIds: [...(section.customConfig.fileIds ?? [])],
            folderIds: [...(section.customConfig.folderIds ?? [])],
          }
        : undefined,
    })),
    favorites: config.favorites.map((favorite) => ({ ...favorite })),
    recents: config.recents.map((recent) => ({ ...recent })),
    projects: config.projects.map((project) => ({
      ...project,
      fileIds: [...project.fileIds],
      folderIds: [...project.folderIds],
    })),
    maxRecents: config.maxRecents,
    showSectionHeaders: config.showSectionHeaders,
    compactMode: config.compactMode,
  };
}

function readActorConfig(profiles: Record<string, SidebarConfig>, actorId: string): SidebarConfig {
  return cloneSidebarConfig(profiles[actorId] ?? DEFAULT_SIDEBAR_CONFIG);
}

function resolveActorId(actorId?: string) {
  return actorId ?? getAuthActorId();
}

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set, get) => {
      const applyActorUpdate = (
        updater: (config: SidebarConfig, state: SidebarState) => SidebarConfig,
      ) => {
        set((state) => {
          const actorId = resolveActorId(state.currentActorId);
          const nextConfig = updater(cloneSidebarConfig(state.config), state);

          return {
            currentActorId: actorId,
            config: nextConfig,
            profiles: {
              ...state.profiles,
              [actorId]: nextConfig,
            },
          };
        });
      };

      return {
        currentActorId: getAuthActorId(),
        config: cloneSidebarConfig(),
        isLoading: false,
        isHydrated: false,
        profiles: {},

        syncActor: (actorId: string) => {
          const nextActorId = resolveActorId(actorId);
          const profiles = get().profiles;
          const nextConfig = readActorConfig(profiles, nextActorId);

          set({
            currentActorId: nextActorId,
            config: nextConfig,
            profiles,
            isLoading: false,
            isHydrated: true,
          });
        },

        getSections: () => {
          return get()
            .config.sections.filter((section) => section.isVisible)
            .toSorted((left, right) => {
              if (left.type === "file-tree" && right.type !== "file-tree") return -1;
              if (right.type === "file-tree" && left.type !== "file-tree") return 1;
              return left.order - right.order;
            });
        },

        toggleSectionCollapse: (sectionId: string) => {
          applyActorUpdate((config) => ({
            ...config,
            sections: config.sections.map((section) =>
              section.id === sectionId ? { ...section, isCollapsed: !section.isCollapsed } : section,
            ),
          }));
        },

        toggleSectionVisibility: (sectionId: string) => {
          applyActorUpdate((config) => ({
            ...config,
            sections: config.sections.map((section) =>
              section.id === sectionId ? { ...section, isVisible: !section.isVisible } : section,
            ),
          }));
        },

        reorderSections: (sectionIds: string[]) => {
          applyActorUpdate((config) => ({
            ...config,
            sections: config.sections.map((section) => ({
              ...section,
              order: sectionIds.indexOf(section.id),
            })),
          }));
        },

        addCustomSection: (name: string) => {
          applyActorUpdate((config) => {
            const newSection: SidebarSection = {
              id: `custom-${crypto.randomUUID()}`,
              type: "custom",
              name,
              isCollapsed: false,
              isVisible: true,
              order: config.sections.length,
              customConfig: {
                fileIds: [],
                folderIds: [],
              },
            };

            return {
              ...config,
              sections: [...config.sections, newSection],
            };
          });
        },

        removeSection: (sectionId: string) => {
          applyActorUpdate((config) => {
            const section = config.sections.find((item) => item.id === sectionId);
            if (section?.type !== "custom") return config;

            return {
              ...config,
              sections: config.sections.filter((section) => section.id !== sectionId),
            };
          });
        },

        renameSection: (sectionId: string, name: string) => {
          applyActorUpdate((config) => ({
            ...config,
            sections: config.sections.map((section) =>
              section.id === sectionId ? { ...section, name } : section,
            ),
          }));
        },

        addToCustomSection: (sectionId: string, itemId: string, itemType: "file" | "folder") => {
          applyActorUpdate((config) => ({
            ...config,
            sections: config.sections.map((section) => {
              if (section.id !== sectionId || section.type !== "custom") return section;

              const customConfig = section.customConfig ?? { fileIds: [], folderIds: [] };

              if (itemType === "file") {
                if (customConfig.fileIds?.includes(itemId)) return section;
                return {
                  ...section,
                  customConfig: {
                    ...customConfig,
                    fileIds: [...(customConfig.fileIds ?? []), itemId],
                  },
                };
              }

              if (customConfig.folderIds?.includes(itemId)) return section;
              return {
                ...section,
                customConfig: {
                  ...customConfig,
                  folderIds: [...(customConfig.folderIds ?? []), itemId],
                },
              };
            }),
          }));
        },

        removeFromCustomSection: (sectionId: string, itemId: string, itemType: "file" | "folder") => {
          applyActorUpdate((config) => ({
            ...config,
            sections: config.sections.map((section) => {
              if (section.id !== sectionId || section.type !== "custom") return section;

              const customConfig = section.customConfig ?? { fileIds: [], folderIds: [] };

              return {
                ...section,
                customConfig: {
                  ...customConfig,
                  fileIds:
                    itemType === "file"
                      ? (customConfig.fileIds ?? []).filter((id) => id !== itemId)
                      : (customConfig.fileIds ?? []),
                  folderIds:
                    itemType === "folder"
                      ? (customConfig.folderIds ?? []).filter((id) => id !== itemId)
                      : (customConfig.folderIds ?? []),
                },
              };
            }),
          }));
        },

        addToFavorites: (itemId: string, itemType: "file" | "folder") => {
          applyActorUpdate((config) => {
            const existing = config.favorites.find((favorite) => favorite.itemId === itemId);
            if (existing) return config;

            const newFavorite: FavoriteItem = {
              id: crypto.randomUUID(),
              itemId,
              itemType,
              addedAt: new Date(),
            };

            return {
              ...config,
              favorites: [...config.favorites, newFavorite],
            };
          });
        },

        removeFromFavorites: (itemId: string) => {
          applyActorUpdate((config) => ({
            ...config,
            favorites: config.favorites.filter((favorite) => favorite.itemId !== itemId),
          }));
        },

        isFavorite: (itemId: string) => {
          return get().config.favorites.some((favorite) => favorite.itemId === itemId);
        },

        addToRecents: (itemId: string, itemType: "file" | "folder") => {
          applyActorUpdate((config) => {
            const filtered = config.recents.filter((recent) => recent.itemId !== itemId);

            const newRecent: RecentItem = {
              id: crypto.randomUUID(),
              itemId,
              itemType,
              accessedAt: new Date(),
            };

            return {
              ...config,
              recents: [newRecent, ...filtered].slice(0, config.maxRecents),
            };
          });
        },

        clearRecents: () => {
          applyActorUpdate((config) => ({
            ...config,
            recents: [],
          }));
        },

        getRecents: () => {
          return get().config.recents;
        },

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

          applyActorUpdate((config) => ({
            ...config,
            projects: [...config.projects, newProject],
          }));

          return newProject;
        },

        updateProject: (projectId: string, updates: Partial<Project>) => {
          applyActorUpdate((config) => ({
            ...config,
            projects: config.projects.map((project) =>
              project.id === projectId ? { ...project, ...updates, updatedAt: new Date() } : project,
            ),
          }));
        },

        deleteProject: (projectId: string) => {
          applyActorUpdate((config) => ({
            ...config,
            projects: config.projects.filter((project) => project.id !== projectId),
          }));
        },

        addToProject: (projectId: string, itemId: string, itemType: "file" | "folder") => {
          applyActorUpdate((config) => ({
            ...config,
            projects: config.projects.map((project) => {
              if (project.id !== projectId) return project;
              if (itemType === "file") {
                if (project.fileIds.includes(itemId)) return project;
                return { ...project, fileIds: [...project.fileIds, itemId], updatedAt: new Date() };
              }

              if (project.folderIds.includes(itemId)) return project;
              return { ...project, folderIds: [...project.folderIds, itemId], updatedAt: new Date() };
            }),
          }));
        },

        removeFromProject: (projectId: string, itemId: string, itemType: "file" | "folder") => {
          applyActorUpdate((config) => ({
            ...config,
            projects: config.projects.map((project) => {
              if (project.id !== projectId) return project;
              if (itemType === "file") {
                return {
                  ...project,
                  fileIds: project.fileIds.filter((id) => id !== itemId),
                  updatedAt: new Date(),
                };
              }

              return {
                ...project,
                folderIds: project.folderIds.filter((id) => id !== itemId),
                updatedAt: new Date(),
              };
            }),
          }));
        },

        getProjects: () => {
          return get().config.projects;
        },

        getProjectById: (projectId: string) => {
          return get().config.projects.find((project) => project.id === projectId);
        },

        setMaxRecents: (max: number) => {
          applyActorUpdate((config) => ({
            ...config,
            maxRecents: max,
            recents: config.recents.slice(0, max),
          }));
        },

        toggleShowSectionHeaders: () => {
          applyActorUpdate((config) => ({
            ...config,
            showSectionHeaders: !config.showSectionHeaders,
          }));
        },

        toggleCompactMode: () => {
          applyActorUpdate((config) => ({
            ...config,
            compactMode: !config.compactMode,
          }));
        },

        resetToDefaults: () => {
          applyActorUpdate(() => cloneSidebarConfig());
        },
      };
    },
    {
      name: "haptic-sidebar",
      partialize: (state) => ({ profiles: state.profiles }),
      merge: (persistedState, currentState) => {
        const state = persistedState as PersistedSidebarState | undefined;
        const actorId = getAuthActorId();
        const profiles = {
          ...state?.profiles,
        };

        if (!profiles[actorId]) {
          if (state?.config) {
            profiles[actorId] = cloneSidebarConfig(state.config);
          } else {
            profiles[actorId] = cloneSidebarConfig();
          }
        }

        const nextConfig = readActorConfig(profiles, actorId);

        return {
          ...currentState,
          profiles,
          currentActorId: actorId,
          config: nextConfig,
          isLoading: false,
          isHydrated: true,
        };
      },
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.isLoading = false;
          state.isHydrated = true;
        }
      },
    },
  ),
);
