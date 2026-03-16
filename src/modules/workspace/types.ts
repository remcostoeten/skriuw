// Workspace types for organizing notes into separate contexts

export type Workspace = {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color: string;
  createdAt: Date;
  updatedAt: Date;
};

export type WorkspaceConfig = {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
};

export const WORKSPACE_COLORS = [
  { name: "Blue", value: "bg-blue-500", text: "text-blue-500" },
  { name: "Emerald", value: "bg-emerald-500", text: "text-emerald-500" },
  { name: "Amber", value: "bg-amber-500", text: "text-amber-500" },
  { name: "Rose", value: "bg-rose-500", text: "text-rose-500" },
  { name: "Violet", value: "bg-violet-500", text: "text-violet-500" },
  { name: "Cyan", value: "bg-cyan-500", text: "text-cyan-500" },
  { name: "Orange", value: "bg-orange-500", text: "text-orange-500" },
  { name: "Teal", value: "bg-teal-500", text: "text-teal-500" },
] as const;

export const DEFAULT_WORKSPACE: Workspace = {
  id: "default",
  name: "Personal Notes",
  color: "bg-blue-500",
  createdAt: new Date(),
  updatedAt: new Date(),
};

export const DEFAULT_WORKSPACE_CONFIG: WorkspaceConfig = {
  workspaces: [DEFAULT_WORKSPACE],
  activeWorkspaceId: "default",
};
