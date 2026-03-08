import { create } from "zustand";
import { persist } from "zustand/middleware";

export const TAG_COLORS = [
  { name: "Gray", value: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30" },
  { name: "Red", value: "bg-red-500/20 text-red-400 border-red-500/30" },
  { name: "Orange", value: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  { name: "Amber", value: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  { name: "Green", value: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  { name: "Teal", value: "bg-teal-500/20 text-teal-400 border-teal-500/30" },
  { name: "Blue", value: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  { name: "Purple", value: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  { name: "Pink", value: "bg-pink-500/20 text-pink-400 border-pink-500/30" },
] as const;

export interface Tag {
  id: string;
  name: string;
  color: string;
  usageCount: number;
  lastUsedAt: Date | null;
  createdAt: Date;
}

const DEFAULT_TAGS: Tag[] = [
  { id: "tag-1", name: "personal", color: TAG_COLORS[4].value, usageCount: 0, lastUsedAt: null, createdAt: new Date() },
  { id: "tag-2", name: "work", color: TAG_COLORS[6].value, usageCount: 0, lastUsedAt: null, createdAt: new Date() },
  { id: "tag-3", name: "ideas", color: TAG_COLORS[7].value, usageCount: 0, lastUsedAt: null, createdAt: new Date() },
  { id: "tag-4", name: "reflection", color: TAG_COLORS[8].value, usageCount: 0, lastUsedAt: null, createdAt: new Date() },
  { id: "tag-5", name: "gratitude", color: TAG_COLORS[3].value, usageCount: 0, lastUsedAt: null, createdAt: new Date() },
];

interface TagState {
  tags: Tag[];

  // Queries
  getAll: () => Tag[];
  getById: (id: string) => Tag | undefined;
  getByName: (name: string) => Tag | undefined;
  getPopular: (limit?: number) => Tag[];
  search: (query: string) => Tag[];

  // Mutations
  create: (name: string, color?: string) => Tag;
  remove: (id: string) => void;
  rename: (id: string, name: string) => void;
  recolor: (id: string, color: string) => void;
  incrementUsage: (id: string) => void;
  decrementUsage: (id: string) => void;
  batchIncrementUsage: (ids: string[]) => void;
}

export const useTagStore = create<TagState>()(
  persist(
    (set, get) => ({
      tags: DEFAULT_TAGS,

      // Queries
      getAll: () => get().tags,

      getById: (id) => get().tags.find((t) => t.id === id),

      getByName: (name) =>
        get().tags.find((t) => t.name.toLowerCase() === name.toLowerCase()),

      getPopular: (limit = 10) =>
        [...get().tags]
          .sort((a, b) => b.usageCount - a.usageCount)
          .slice(0, limit),

      search: (query) => {
        const q = query.toLowerCase();
        return get().tags.filter((t) => t.name.toLowerCase().includes(q));
      },

      // Mutations
      create: (name, color) => {
        const trimmed = name.trim().toLowerCase();
        const existing = get().getByName(trimmed);
        if (existing) return existing;

        const newTag: Tag = {
          id: crypto.randomUUID(),
          name: trimmed,
          color:
            color || TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)].value,
          usageCount: 0,
          lastUsedAt: null,
          createdAt: new Date(),
        };

        set((state) => ({ tags: [...state.tags, newTag] }));
        return newTag;
      },

      remove: (id) => {
        set((state) => ({ tags: state.tags.filter((t) => t.id !== id) }));
      },

      rename: (id, name) => {
        set((state) => ({
          tags: state.tags.map((t) =>
            t.id === id ? { ...t, name: name.trim().toLowerCase() } : t,
          ),
        }));
      },

      recolor: (id, color) => {
        set((state) => ({
          tags: state.tags.map((t) => (t.id === id ? { ...t, color } : t)),
        }));
      },

      incrementUsage: (id) => {
        set((state) => ({
          tags: state.tags.map((t) =>
            t.id === id
              ? { ...t, usageCount: t.usageCount + 1, lastUsedAt: new Date() }
              : t,
          ),
        }));
      },

      decrementUsage: (id) => {
        set((state) => ({
          tags: state.tags.map((t) =>
            t.id === id
              ? { ...t, usageCount: Math.max(0, t.usageCount - 1) }
              : t,
          ),
        }));
      },

      batchIncrementUsage: (ids) => {
        set((state) => ({
          tags: state.tags.map((t) =>
            ids.includes(t.id)
              ? { ...t, usageCount: t.usageCount + 1, lastUsedAt: new Date() }
              : t,
          ),
        }));
      },
    }),
    {
      name: "tag-store",
      partialize: (state) => ({ tags: state.tags }),
    },
  ),
);
