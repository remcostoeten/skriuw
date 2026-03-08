import { create } from "zustand";
import { format } from "date-fns";
import type { SaveStatus } from "@/shared/components/save-status-badge";
import type { MoodLevel } from "@/types/notes";
import {
  createJournalEntry,
  createJournalTag,
  destroyJournalEntry,
  destroyJournalTag,
  readJournalEntries,
  readJournalTags,
  updateJournalEntry,
} from "@/core/journal";
import type {
  CssColorValue,
  DateKey,
  JournalEntryId,
  TagId,
  TagName,
} from "@/core/shared/persistence-types";
import {
  JournalConfig,
  JournalEntry,
  JournalTag,
  TAG_COLORS,
  DEFAULT_JOURNAL_CONFIG,
} from "./types";

type JournalState = {
  config: JournalConfig;
  isHydrated: boolean;
  saveStates: Record<string, SaveStatus>;
  initialize: () => Promise<void>;
  getEntrySaveState: (id: string | null | undefined) => SaveStatus;
  getEntryByDate: (date: Date) => JournalEntry | undefined;
  getEntryByDateKey: (dateKey: string) => JournalEntry | undefined;
  getEntriesForMonth: (year: number, month: number) => JournalEntry[];
  createOrUpdateEntry: (
    date: Date,
    content: string,
    tags?: string[],
    mood?: MoodLevel,
  ) => JournalEntry;
  deleteEntry: (id: string) => void;
  updateEntryContent: (id: string, content: string) => void;
  updateEntryMood: (id: string, mood: MoodLevel | undefined) => void;
  addTagToEntry: (entryId: string, tagName: string) => void;
  removeTagFromEntry: (entryId: string, tagName: string) => void;
  getDatesWithEntries: () => string[];
  getAllTags: () => JournalTag[];
  createTag: (name: string) => JournalTag;
  deleteTag: (id: string) => void;
  getTagSuggestions: (query: string) => JournalTag[];
  getEntriesByTag: (tagName: string) => JournalEntry[];
};

function toDateKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function normalizeTagName(tagName: string): string {
  return tagName.toLowerCase().trim();
}

const contentSaveTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
const saveStatusResetTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleSaveStatusReset(id: string, onReset: () => void) {
  const existingTimeout = saveStatusResetTimeouts.get(id);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }

  const timeoutId = setTimeout(() => {
    saveStatusResetTimeouts.delete(id);
    onReset();
  }, 1800);

  saveStatusResetTimeouts.set(id, timeoutId);
}

export const useJournalStore = create<JournalState>()((set, get) => ({
  config: DEFAULT_JOURNAL_CONFIG,
  isHydrated: false,
  saveStates: {},

  initialize: async () => {
    if (get().isHydrated) return;

    const [entries, tags] = await Promise.all([readJournalEntries(), readJournalTags()]);
    set({
      config: {
        entries,
        tags,
      },
      isHydrated: true,
    });
  },

  getEntrySaveState: (id) => {
    if (!id) return "idle";
    return get().saveStates[id] ?? "idle";
  },

  getEntryByDate: (date: Date) => {
    const key = toDateKey(date);
    return get().config.entries.find((entry) => entry.dateKey === key);
  },

  getEntryByDateKey: (dateKey: string) => {
    return get().config.entries.find((entry) => entry.dateKey === dateKey);
  },

  getEntriesForMonth: (year: number, month: number) => {
    const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
    return get().config.entries.filter((entry) => entry.dateKey.startsWith(prefix));
  },

  createOrUpdateEntry: (date: Date, content: string, tags?: string[], mood?: MoodLevel) => {
    const key = toDateKey(date);
    const existing = get().config.entries.find((entry) => entry.dateKey === key);
    const normalizedTags = tags?.map(normalizeTagName) ?? existing?.tags ?? [];
    const updatedAt = new Date();

    if (existing) {
      const nextEntry: JournalEntry = {
        ...existing,
        content,
        tags: normalizedTags,
        mood: mood ?? existing.mood,
        updatedAt,
      };

      set((state) => ({
        config: {
          ...state.config,
          entries: state.config.entries.map((entry) =>
            entry.id === existing.id ? nextEntry : entry,
          ),
        },
        saveStates: { ...state.saveStates, [existing.id]: "saving" },
      }));

      void updateJournalEntry({
        id: existing.id as JournalEntryId,
        content,
        tags: normalizedTags.map((tag) => tag as TagName),
        mood: mood ?? existing.mood,
        updatedAt,
      })
        .then(() => {
          set((state) => ({
            saveStates: { ...state.saveStates, [existing.id]: "saved" },
          }));
          scheduleSaveStatusReset(existing.id, () => {
            set((state) => ({
              saveStates: { ...state.saveStates, [existing.id]: "idle" },
            }));
          });
        })
        .catch(() => {
          set((state) => ({
            saveStates: { ...state.saveStates, [existing.id]: "error" },
          }));
        });

      return nextEntry;
    }

    const newEntry: JournalEntry = {
      id: crypto.randomUUID(),
      dateKey: key,
      content,
      tags: normalizedTags,
      mood,
      createdAt: updatedAt,
      updatedAt,
    };

    set((state) => ({
      config: {
        ...state.config,
        entries: [...state.config.entries, newEntry],
      },
      saveStates: { ...state.saveStates, [newEntry.id]: "saving" },
    }));

    void createJournalEntry({
      id: newEntry.id as JournalEntryId,
      dateKey: newEntry.dateKey as DateKey,
      content: newEntry.content,
      tags: normalizedTags.map((tag) => tag as TagName),
      mood,
      createdAt: newEntry.createdAt,
      updatedAt: newEntry.updatedAt,
    })
      .then(() => {
        set((state) => ({
          saveStates: { ...state.saveStates, [newEntry.id]: "saved" },
        }));
        scheduleSaveStatusReset(newEntry.id, () => {
          set((state) => ({
            saveStates: { ...state.saveStates, [newEntry.id]: "idle" },
          }));
        });
      })
      .catch(() => {
        set((state) => ({
          saveStates: { ...state.saveStates, [newEntry.id]: "error" },
        }));
      });

    return newEntry;
  },

  deleteEntry: (id: string) => {
    set((state) => ({
      config: {
        ...state.config,
        entries: state.config.entries.filter((entry) => entry.id !== id),
      },
      saveStates: Object.fromEntries(
        Object.entries(state.saveStates).filter(([key]) => key !== id),
      ),
    }));

    const pendingTimeout = contentSaveTimeouts.get(id);
    if (pendingTimeout) {
      clearTimeout(pendingTimeout);
      contentSaveTimeouts.delete(id);
    }

    void destroyJournalEntry(id as JournalEntryId).catch(() => {
      set((state) => ({
        saveStates: { ...state.saveStates, [id]: "error" },
      }));
    });
  },

  updateEntryContent: (id: string, content: string) => {
    const updatedAt = new Date();

    set((state) => ({
      config: {
        ...state.config,
        entries: state.config.entries.map((entry) =>
          entry.id === id ? { ...entry, content, updatedAt } : entry,
        ),
      },
      saveStates: { ...state.saveStates, [id]: "saving" },
    }));

    const pendingTimeout = contentSaveTimeouts.get(id);
    if (pendingTimeout) {
      clearTimeout(pendingTimeout);
    }

    const timeoutId = setTimeout(() => {
      contentSaveTimeouts.delete(id);
      void updateJournalEntry({
        id: id as JournalEntryId,
        content,
        updatedAt,
      })
        .then(() => {
          set((state) => ({
            saveStates: { ...state.saveStates, [id]: "saved" },
          }));
          scheduleSaveStatusReset(id, () => {
            set((state) => ({
              saveStates: { ...state.saveStates, [id]: "idle" },
            }));
          });
        })
        .catch(() => {
          set((state) => ({
            saveStates: { ...state.saveStates, [id]: "error" },
          }));
        });
    }, 220);

    contentSaveTimeouts.set(id, timeoutId);
  },

  updateEntryMood: (id: string, mood: MoodLevel | undefined) => {
    const updatedAt = new Date();

    set((state) => ({
      config: {
        ...state.config,
        entries: state.config.entries.map((entry) =>
          entry.id === id ? { ...entry, mood, updatedAt } : entry,
        ),
      },
      saveStates: { ...state.saveStates, [id]: "saving" },
    }));

    void updateJournalEntry({
      id: id as JournalEntryId,
      mood,
      updatedAt,
    })
      .then(() => {
        set((state) => ({
          saveStates: { ...state.saveStates, [id]: "saved" },
        }));
        scheduleSaveStatusReset(id, () => {
          set((state) => ({
            saveStates: { ...state.saveStates, [id]: "idle" },
          }));
        });
      })
      .catch(() => {
        set((state) => ({
          saveStates: { ...state.saveStates, [id]: "error" },
        }));
      });
  },

  addTagToEntry: (entryId: string, tagName: string) => {
    const normalizedTag = normalizeTagName(tagName);
    if (!normalizedTag) return;

    const updatedAt = new Date();

    set((state) => {
      const tagExists = state.config.tags.some((tag) => tag.name === normalizedTag);
      const updatedTags = tagExists
        ? state.config.tags.map((tag) =>
            tag.name === normalizedTag ? { ...tag, usageCount: tag.usageCount + 1 } : tag,
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

      const entry = state.config.entries.find((item) => item.id === entryId);
      const nextEntryTags =
        entry && !entry.tags.includes(normalizedTag) ? [...entry.tags, normalizedTag] : entry?.tags;

      return {
        config: {
          ...state.config,
          tags: updatedTags,
          entries: state.config.entries.map((item) =>
            item.id === entryId && nextEntryTags
              ? { ...item, tags: nextEntryTags, updatedAt }
              : item,
          ),
        },
      };
    });

    const createdTag = get().config.tags.find((tag) => tag.name === normalizedTag);
    if (!createdTag) {
      void createJournalTag({
        name: normalizedTag as TagName,
        color: TAG_COLORS[
          (get().config.tags.length - 1 + TAG_COLORS.length) % TAG_COLORS.length
        ] as CssColorValue,
      });
    }

    const entry = get().config.entries.find((item) => item.id === entryId);
    if (entry) {
      void updateJournalEntry({
        id: entry.id as JournalEntryId,
        tags: entry.tags.map((tag) => tag as TagName),
        updatedAt,
      });
    }
  },

  removeTagFromEntry: (entryId: string, tagName: string) => {
    const normalizedTag = normalizeTagName(tagName);
    const updatedAt = new Date();

    set((state) => ({
      config: {
        ...state.config,
        entries: state.config.entries.map((entry) =>
          entry.id === entryId
            ? {
                ...entry,
                tags: entry.tags.filter((tag) => tag !== normalizedTag),
                updatedAt,
              }
            : entry,
        ),
        tags: state.config.tags.map((tag) =>
          tag.name === normalizedTag
            ? { ...tag, usageCount: Math.max(0, tag.usageCount - 1) }
            : tag,
        ),
      },
    }));

    const entry = get().config.entries.find((item) => item.id === entryId);
    if (entry) {
      void updateJournalEntry({
        id: entry.id as JournalEntryId,
        tags: entry.tags.map((tag) => tag as TagName),
        updatedAt,
      });
    }
  },

  getDatesWithEntries: () => {
    return get().config.entries.map((entry) => entry.dateKey);
  },

  getAllTags: () => {
    return get().config.tags.toSorted((a, b) => b.usageCount - a.usageCount);
  },

  createTag: (name: string) => {
    const normalizedName = normalizeTagName(name);
    const existing = get().config.tags.find((tag) => tag.name === normalizedName);
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

    void createJournalTag({
      id: newTag.id as TagId,
      name: newTag.name as TagName,
      color: newTag.color as CssColorValue,
    });

    return newTag;
  },

  deleteTag: (id: string) => {
    const tag = get().config.tags.find((item) => item.id === id);
    if (!tag) return;

    set((state) => ({
      config: {
        ...state.config,
        tags: state.config.tags.filter((item) => item.id !== id),
        entries: state.config.entries.map((entry) => ({
          ...entry,
          tags: entry.tags.filter((entryTag) => entryTag !== tag.name),
        })),
      },
    }));

    void destroyJournalTag(id as TagId);
  },

  getTagSuggestions: (query: string) => {
    const lower = query.toLowerCase().trim();
    if (!lower) {
      return get()
        .config.tags.toSorted((a, b) => b.usageCount - a.usageCount)
        .slice(0, 8);
    }

    return get()
      .config.tags.filter((tag) => tag.name.includes(lower))
      .toSorted((a, b) => b.usageCount - a.usageCount)
      .slice(0, 8);
  },

  getEntriesByTag: (tagName: string) => {
    const normalizedTag = normalizeTagName(tagName);
    return get().config.entries.filter((entry) => entry.tags.includes(normalizedTag));
  },
}));
