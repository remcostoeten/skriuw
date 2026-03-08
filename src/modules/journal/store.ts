import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { format } from 'date-fns';
import { MoodLevel } from '@/types/notes';
import {
  JournalConfig,
  JournalEntry,
  JournalTag,
  TAG_COLORS,
  DEFAULT_JOURNAL_CONFIG,
} from './types';

type JournalState = {
  config: JournalConfig;

  // Entry management
  getEntryByDate: (date: Date) => JournalEntry | undefined;
  getEntryByDateKey: (dateKey: string) => JournalEntry | undefined;
  getEntriesForMonth: (year: number, month: number) => JournalEntry[];
  createOrUpdateEntry: (date: Date, content: string, tags?: string[], mood?: MoodLevel) => JournalEntry;
  deleteEntry: (id: string) => void;
  updateEntryContent: (id: string, content: string) => void;
  updateEntryMood: (id: string, mood: MoodLevel | undefined) => void;
  addTagToEntry: (entryId: string, tagName: string) => void;
  removeTagFromEntry: (entryId: string, tagName: string) => void;
  getDatesWithEntries: () => string[];

  // Tag management
  getAllTags: () => JournalTag[];
  createTag: (name: string) => JournalTag;
  deleteTag: (id: string) => void;
  getTagSuggestions: (query: string) => JournalTag[];
  getEntriesByTag: (tagName: string) => JournalEntry[];
};

function toDateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export const useJournalStore = create<JournalState>()(
  persist(
    (set, get) => ({
      config: DEFAULT_JOURNAL_CONFIG,

      getEntryByDate: (date: Date) => {
        const key = toDateKey(date);
        return get().config.entries.find((e) => e.dateKey === key);
      },

      getEntryByDateKey: (dateKey: string) => {
        return get().config.entries.find((e) => e.dateKey === dateKey);
      },

      getEntriesForMonth: (year: number, month: number) => {
        const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
        return get().config.entries.filter((e) => e.dateKey.startsWith(prefix));
      },

      createOrUpdateEntry: (date: Date, content: string, tags?: string[], mood?: MoodLevel) => {
        const key = toDateKey(date);
        const existing = get().config.entries.find((e) => e.dateKey === key);

        if (existing) {
          set((state) => ({
            config: {
              ...state.config,
              entries: state.config.entries.map((e) =>
                e.id === existing.id
                  ? {
                      ...e,
                      content,
                      tags: tags ?? e.tags,
                      mood: mood ?? e.mood,
                      updatedAt: new Date(),
                    }
                  : e,
              ),
            },
          }));
          return { ...existing, content, tags: tags ?? existing.tags, mood: mood ?? existing.mood };
        }

        const newEntry: JournalEntry = {
          id: crypto.randomUUID(),
          dateKey: key,
          content,
          tags: tags ?? [],
          mood,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        set((state) => ({
          config: {
            ...state.config,
            entries: [...state.config.entries, newEntry],
          },
        }));

        return newEntry;
      },

      deleteEntry: (id: string) => {
        set((state) => ({
          config: {
            ...state.config,
            entries: state.config.entries.filter((e) => e.id !== id),
          },
        }));
      },

      updateEntryContent: (id: string, content: string) => {
        set((state) => ({
          config: {
            ...state.config,
            entries: state.config.entries.map((e) =>
              e.id === id ? { ...e, content, updatedAt: new Date() } : e,
            ),
          },
        }));
      },

      updateEntryMood: (id: string, mood: MoodLevel | undefined) => {
        set((state) => ({
          config: {
            ...state.config,
            entries: state.config.entries.map((e) =>
              e.id === id ? { ...e, mood, updatedAt: new Date() } : e,
            ),
          },
        }));
      },

      addTagToEntry: (entryId: string, tagName: string) => {
        const normalizedTag = tagName.toLowerCase().trim();
        if (!normalizedTag) return;

        set((state) => {
          // Ensure tag exists in tag registry
          const tagExists = state.config.tags.some((t) => t.name === normalizedTag);
          const updatedTags = tagExists
            ? state.config.tags.map((t) =>
                t.name === normalizedTag ? { ...t, usageCount: t.usageCount + 1 } : t,
              )
            : [
                ...state.config.tags,
                {
                  id: crypto.randomUUID(),
                  name: normalizedTag,
                  color: TAG_COLORS[state.config.tags.length % TAG_COLORS.length],
                  usageCount: 1,
                },
              ];

          return {
            config: {
              ...state.config,
              tags: updatedTags,
              entries: state.config.entries.map((e) =>
                e.id === entryId && !e.tags.includes(normalizedTag)
                  ? { ...e, tags: [...e.tags, normalizedTag], updatedAt: new Date() }
                  : e,
              ),
            },
          };
        });
      },

      removeTagFromEntry: (entryId: string, tagName: string) => {
        set((state) => ({
          config: {
            ...state.config,
            entries: state.config.entries.map((e) =>
              e.id === entryId
                ? { ...e, tags: e.tags.filter((t) => t !== tagName), updatedAt: new Date() }
                : e,
            ),
            tags: state.config.tags.map((t) =>
              t.name === tagName ? { ...t, usageCount: Math.max(0, t.usageCount - 1) } : t,
            ),
          },
        }));
      },

      getDatesWithEntries: () => {
        return get().config.entries.map((e) => e.dateKey);
      },

      // Tag management
      getAllTags: () => {
        return get().config.tags.toSorted((a, b) => b.usageCount - a.usageCount);
      },

      createTag: (name: string) => {
        const normalizedName = name.toLowerCase().trim();
        const existing = get().config.tags.find((t) => t.name === normalizedName);
        if (existing) return existing;

        const newTag: JournalTag = {
          id: crypto.randomUUID(),
          name: normalizedName,
          color: TAG_COLORS[get().config.tags.length % TAG_COLORS.length],
          usageCount: 0,
        };

        set((state) => ({
          config: {
            ...state.config,
            tags: [...state.config.tags, newTag],
          },
        }));

        return newTag;
      },

      deleteTag: (id: string) => {
        const tag = get().config.tags.find((t) => t.id === id);
        if (!tag) return;

        set((state) => ({
          config: {
            ...state.config,
            tags: state.config.tags.filter((t) => t.id !== id),
            entries: state.config.entries.map((e) => ({
              ...e,
              tags: e.tags.filter((t) => t !== tag.name),
            })),
          },
        }));
      },

      getTagSuggestions: (query: string) => {
        const lower = query.toLowerCase().trim();
        if (!lower) return get().config.tags.toSorted((a, b) => b.usageCount - a.usageCount).slice(0, 8);
        return get()
          .config.tags.filter((t) => t.name.includes(lower))
          .toSorted((a, b) => b.usageCount - a.usageCount)
          .slice(0, 8);
      },

      getEntriesByTag: (tagName: string) => {
        return get().config.entries.filter((e) => e.tags.includes(tagName));
      },
    }),
    {
      name: 'haptic-journal',
      partialize: (state) => ({ config: state.config }),
    },
  ),
);
