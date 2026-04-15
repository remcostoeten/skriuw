import { create } from "zustand";
import { format } from "date-fns";
import type { SaveStatus } from "@/shared/components/save-status-badge";
import type {
  CssColorValue,
  DateKey,
  JournalEntryId,
  TagId,
  TagName,
} from "@/core/shared/persistence-types";
import { journalRepository } from "@/core/persistence/repositories";
import type { MoodLevel } from "./types";
import {
  DEFAULT_JOURNAL_CONFIG,
  TAG_COLORS,
  type JournalConfig,
  type JournalEntry,
  type JournalTag,
} from "./types";
import { captureWorkspaceGuard, type WorkspaceGuard } from "@/core/shared/workspace-guard";
import { getWorkspaceId } from "@/platform/auth";

type JournalState = {
  config: JournalConfig;
  isHydrated: boolean;
  saveStates: Record<string, SaveStatus>;
  resetWorkspace: () => void;
  initialize: (workspaceId?: string) => Promise<void>;
  getEntrySaveState: (id: string | null | undefined) => SaveStatus;
  getEntryByDate: (date: Date) => JournalEntry | undefined;
  getEntryByDateKey: (dateKey: DateKey | string) => JournalEntry | undefined;
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
  getDatesWithEntries: () => DateKey[];
  getAllTags: () => JournalTag[];
  createTag: (name: string, color?: string) => JournalTag;
  deleteTag: (id: string) => void;
  getTagSuggestions: (query: string) => JournalTag[];
  getEntriesByTag: (tagName: string) => JournalEntry[];
};

function toDateKey(date: Date): DateKey {
  return format(date, "yyyy-MM-dd") as DateKey;
}

function normalizeTagName(tagName: string): string {
  return tagName.toLowerCase().trim();
}

const contentSaveTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
const saveStatusResetTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

function clearTimeoutMap(timeoutMap: Map<string, ReturnType<typeof setTimeout>>) {
  for (const timeoutId of timeoutMap.values()) {
    clearTimeout(timeoutId);
  }

  timeoutMap.clear();
}

function resetPendingJournalSideEffects() {
  clearTimeoutMap(contentSaveTimeouts);
  clearTimeoutMap(saveStatusResetTimeouts);
}

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

function setEntrySaveState(
  set: Parameters<typeof create<JournalState>>[0],
  id: string,
  status: SaveStatus,
) {
  set((state) => ({
    saveStates: { ...state.saveStates, [id]: status },
  }));
}

function scheduleWorkspaceSaveStateReset(
  workspaceGuard: WorkspaceGuard,
  id: string,
  set: Parameters<typeof create<JournalState>>[0],
) {
  scheduleSaveStatusReset(id, () => {
    workspaceGuard.runIfCurrent(() => {
      setEntrySaveState(set, id, "idle");
    });
  });
}

export const useJournalStore = create<JournalState>()((set, get) => ({
  config: DEFAULT_JOURNAL_CONFIG,
  isHydrated: false,
  saveStates: {},

  resetWorkspace: () => {
    resetPendingJournalSideEffects();
    set({
      config: DEFAULT_JOURNAL_CONFIG,
      isHydrated: false,
      saveStates: {},
    });
  },

  initialize: async (workspaceId = getWorkspaceId()) => {
    const workspaceGuard = captureWorkspaceGuard(getWorkspaceId, workspaceId);
    if (get().isHydrated) return;

    const [entries, tags] = await Promise.all([
      journalRepository.listEntries(),
      journalRepository.listTags(),
    ]);

    if (!workspaceGuard.isCurrent()) {
      return;
    }

    set({
      config: {
        entries,
        tags,
      },
      isHydrated: true,
      saveStates: {},
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

  getEntryByDateKey: (dateKey: DateKey | string) => {
    return get().config.entries.find((entry) => entry.dateKey === dateKey);
  },

  getEntriesForMonth: (year: number, month: number) => {
    const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
    return get().config.entries.filter((entry) => entry.dateKey.startsWith(prefix));
  },

  createOrUpdateEntry: (date: Date, content: string, tags?: string[], mood?: MoodLevel) => {
    const workspaceGuard = captureWorkspaceGuard(getWorkspaceId);
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
        saveStates: { ...state.saveStates, [existing.id]: "saving" as const },
      }));

      void journalRepository.updateEntry({
        id: existing.id as JournalEntryId,
        content,
        tags: normalizedTags.map((tag) => tag as TagName),
        mood: mood ?? existing.mood,
        updatedAt,
      })
        .then(() => {
          if (!workspaceGuard.runIfCurrent(() => setEntrySaveState(set, existing.id, "saved"))) {
            return;
          }

          scheduleWorkspaceSaveStateReset(workspaceGuard, existing.id, set);
        })
        .catch(() => {
          workspaceGuard.runIfCurrent(() => {
            setEntrySaveState(set, existing.id, "error");
          });
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
      saveStates: { ...state.saveStates, [newEntry.id]: "saving" as const },
    }));

    void journalRepository.createEntry({
      id: newEntry.id as JournalEntryId,
      dateKey: newEntry.dateKey as DateKey,
      content: newEntry.content,
      tags: normalizedTags.map((tag) => tag as TagName),
      mood,
      createdAt: newEntry.createdAt,
      updatedAt: newEntry.updatedAt,
    })
      .then(() => {
        if (!workspaceGuard.runIfCurrent(() => setEntrySaveState(set, newEntry.id, "saved"))) {
          return;
        }

        scheduleWorkspaceSaveStateReset(workspaceGuard, newEntry.id, set);
      })
      .catch(() => {
        workspaceGuard.runIfCurrent(() => {
          setEntrySaveState(set, newEntry.id, "error");
        });
      });

    return newEntry;
  },

  deleteEntry: (id: string) => {
    const workspaceGuard = captureWorkspaceGuard(getWorkspaceId);
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

    void journalRepository.destroyEntry(id as JournalEntryId).catch(() => {
      workspaceGuard.runIfCurrent(() => {
        setEntrySaveState(set, id, "error");
      });
    });
  },

  updateEntryContent: (id: string, content: string) => {
    const workspaceGuard = captureWorkspaceGuard(getWorkspaceId);
    const updatedAt = new Date();

    set((state) => ({
      config: {
        ...state.config,
        entries: state.config.entries.map((entry) =>
          entry.id === id ? { ...entry, content, updatedAt } : entry,
        ),
      },
      saveStates: { ...state.saveStates, [id]: "saving" as const },
    }));

    const pendingTimeout = contentSaveTimeouts.get(id);
    if (pendingTimeout) {
      clearTimeout(pendingTimeout);
    }

    const timeoutId = setTimeout(() => {
      contentSaveTimeouts.delete(id);

      if (!workspaceGuard.isCurrent()) {
        return;
      }

      void journalRepository.updateEntry({
        id: id as JournalEntryId,
        content,
        updatedAt,
      })
        .then(() => {
          if (!workspaceGuard.runIfCurrent(() => setEntrySaveState(set, id, "saved"))) {
            return;
          }

          scheduleWorkspaceSaveStateReset(workspaceGuard, id, set);
        })
        .catch(() => {
          workspaceGuard.runIfCurrent(() => {
            setEntrySaveState(set, id, "error");
          });
        });
    }, 220);

    contentSaveTimeouts.set(id, timeoutId);
  },

  updateEntryMood: (id: string, mood: MoodLevel | undefined) => {
    const workspaceGuard = captureWorkspaceGuard(getWorkspaceId);
    const updatedAt = new Date();

    set((state) => ({
      config: {
        ...state.config,
        entries: state.config.entries.map((entry) =>
          entry.id === id ? { ...entry, mood, updatedAt } : entry,
        ),
      },
      saveStates: { ...state.saveStates, [id]: "saving" as const },
    }));

    void journalRepository.updateEntry({
      id: id as JournalEntryId,
      mood,
      updatedAt,
    })
      .then(() => {
        if (!workspaceGuard.runIfCurrent(() => setEntrySaveState(set, id, "saved"))) {
          return;
        }

        scheduleWorkspaceSaveStateReset(workspaceGuard, id, set);
      })
      .catch(() => {
        workspaceGuard.runIfCurrent(() => {
          setEntrySaveState(set, id, "error");
        });
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
      void journalRepository.createTag({
        name: normalizedTag as TagName,
        color: TAG_COLORS[
          (get().config.tags.length - 1 + TAG_COLORS.length) % TAG_COLORS.length
        ],
      });
    }

    const entry = get().config.entries.find((item) => item.id === entryId);
    if (entry) {
      void journalRepository.updateEntry({
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
      void journalRepository.updateEntry({
        id: entry.id as JournalEntryId,
        tags: entry.tags.map((tag) => tag as TagName),
        updatedAt,
      });
    }
  },

  getDatesWithEntries: () => {
    return get().config.entries.map((entry) => entry.dateKey as DateKey);
  },

  getAllTags: () => {
    return get().config.tags.toSorted((a, b) => b.usageCount - a.usageCount);
  },

  createTag: (name: string, color?: string) => {
    const normalizedName = normalizeTagName(name);
    const existing = get().config.tags.find((tag) => tag.name === normalizedName);
    if (existing) return existing;

    const newTag: JournalTag = {
      id: crypto.randomUUID(),
      name: normalizedName,
      color: color ?? TAG_COLORS[get().config.tags.length % TAG_COLORS.length],
      usageCount: 0,
    };

    set((state) => ({
      config: {
        ...state.config,
        tags: [...state.config.tags, newTag],
      },
    }));

    void journalRepository.createTag({
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

    void journalRepository.destroyTag(id as TagId);
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
