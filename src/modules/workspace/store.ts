import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  Workspace,
  WorkspaceConfig,
  DEFAULT_WORKSPACE_CONFIG,
  WORKSPACE_COLORS,
} from "./types";

type WorkspaceState = {
  config: WorkspaceConfig;

  // Getters
  getWorkspaces: () => Workspace[];
  getActiveWorkspace: () => Workspace | null;
  getActiveWorkspaceId: () => string | null;

  // Actions
  createWorkspace: (name: string, color?: string) => Workspace;
  updateWorkspace: (workspaceId: string, updates: Partial<Workspace>) => void;
  deleteWorkspace: (workspaceId: string) => void;
  setActiveWorkspace: (workspaceId: string) => void;
};

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      config: DEFAULT_WORKSPACE_CONFIG,

      getWorkspaces: () => {
        return get().config.workspaces;
      },

      getActiveWorkspace: () => {
        const { workspaces, activeWorkspaceId } = get().config;
        return workspaces.find((w) => w.id === activeWorkspaceId) ?? null;
      },

      getActiveWorkspaceId: () => {
        return get().config.activeWorkspaceId;
      },

      createWorkspace: (name: string, color?: string) => {
        const newWorkspace: Workspace = {
          id: crypto.randomUUID(),
          name,
          color: color || WORKSPACE_COLORS[Math.floor(Math.random() * WORKSPACE_COLORS.length)].value,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        set((state) => ({
          config: {
            ...state.config,
            workspaces: [...state.config.workspaces, newWorkspace],
          },
        }));

        return newWorkspace;
      },

      updateWorkspace: (workspaceId: string, updates: Partial<Workspace>) => {
        set((state) => ({
          config: {
            ...state.config,
            workspaces: state.config.workspaces.map((w) =>
              w.id === workspaceId ? { ...w, ...updates, updatedAt: new Date() } : w
            ),
          },
        }));
      },

      deleteWorkspace: (workspaceId: string) => {
        const { workspaces, activeWorkspaceId } = get().config;
        
        // Don't delete the last workspace
        if (workspaces.length <= 1) return;

        // If deleting active workspace, switch to another one
        const remainingWorkspaces = workspaces.filter((w) => w.id !== workspaceId);
        const newActiveId =
          activeWorkspaceId === workspaceId
            ? remainingWorkspaces[0]?.id ?? null
            : activeWorkspaceId;

        set((state) => ({
          config: {
            ...state.config,
            workspaces: remainingWorkspaces,
            activeWorkspaceId: newActiveId,
          },
        }));
      },

      setActiveWorkspace: (workspaceId: string) => {
        const workspace = get().config.workspaces.find((w) => w.id === workspaceId);
        if (!workspace) return;

        set((state) => ({
          config: {
            ...state.config,
            activeWorkspaceId: workspaceId,
          },
        }));
      },
    }),
    {
      name: "haptic-workspaces",
      partialize: (state) => ({ config: state.config }),
    }
  )
);
