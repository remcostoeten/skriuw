"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import type { SaveStatus } from "@/shared/components/save-status-badge";
import { getWorkspaceId } from "@/platform/auth";
import {
  useCreateJournalEntry,
  useCreateJournalTag,
  useDeleteJournalEntry,
  useJournalEntries,
  useJournalTags,
  useUpdateJournalEntry,
} from "./use-journal-queries";
import { TAG_COLORS, type JournalEntry, type MoodLevel } from "../types";
import type {
  CssColorValue,
  DateKey,
  JournalEntryId,
  TagName,
} from "@/core/shared/persistence-types";

const CONTENT_SAVE_DEBOUNCE_MS = 650;
const SAVED_BADGE_DURATION_MS = 1600;

function normalizeTagName(tagName: string): TagName {
  return tagName.trim().toLowerCase() as TagName;
}

function uniqueTags(tagNames: string[]): TagName[] {
  return [...new Set(tagNames.map(normalizeTagName))];
}

export type JournalEntryController = {
  content: string;
  setContent: (newContent: string) => void;
  entry: JournalEntry | undefined;
  tags: ReturnType<typeof useJournalTags>["data"];
  wordCount: number;
  saveState: SaveStatus;
  handleMoodSelect: (mood: MoodLevel) => void;
  handleAddTag: (tagName: string, color?: CssColorValue) => void;
  handleRemoveTag: (tagName: string) => void;
  handleDeleteEntry: () => void;
};

export function useJournalEntry(selectedDate: Date): JournalEntryController {
  const workspaceId = getWorkspaceId();
  const dateKey = format(selectedDate, "yyyy-MM-dd") as DateKey;
  const { data: entries = [] } = useJournalEntries();
  const tagsQuery = useJournalTags();
  const createEntryMutation = useCreateJournalEntry();
  const updateEntryMutation = useUpdateJournalEntry();
  const deleteEntryMutation = useDeleteJournalEntry();
  const createTagMutation = useCreateJournalTag();

  const entry = useMemo(
    () => entries.find((item) => item.dateKey === dateKey),
    [dateKey, entries],
  );

  const [content, setContent] = useState(entry?.content ?? "");
  const [saveState, setSaveState] = useState<SaveStatus>("idle");
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveStatusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingEntryIdRef = useRef<JournalEntryId | null>(null);

  const clearPendingSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
  }, []);

  const clearSaveStatusReset = useCallback(() => {
    if (saveStatusTimeoutRef.current) {
      clearTimeout(saveStatusTimeoutRef.current);
      saveStatusTimeoutRef.current = null;
    }
  }, []);

  const markSaving = useCallback(() => {
    clearSaveStatusReset();
    setSaveState("saving");
  }, [clearSaveStatusReset]);

  const markSaved = useCallback(() => {
    clearSaveStatusReset();
    setSaveState("saved");
    saveStatusTimeoutRef.current = setTimeout(() => {
      setSaveState("idle");
      saveStatusTimeoutRef.current = null;
    }, SAVED_BADGE_DURATION_MS);
  }, [clearSaveStatusReset]);

  const markError = useCallback(() => {
    clearSaveStatusReset();
    setSaveState("error");
  }, [clearSaveStatusReset]);

  useEffect(() => {
    pendingEntryIdRef.current = entry?.id as JournalEntryId | null;
    setContent(entry?.content ?? "");
    clearPendingSave();
    clearSaveStatusReset();
    setSaveState("idle");
  }, [clearPendingSave, clearSaveStatusReset, dateKey, entry?.content, entry?.id, workspaceId]);

  useEffect(() => () => {
    clearPendingSave();
    clearSaveStatusReset();
  }, [clearPendingSave, clearSaveStatusReset]);

  const ensureTag = useCallback(
    async (tagName: string, color?: CssColorValue) => {
      const normalizedTag = normalizeTagName(tagName);
      const existingTag = (tagsQuery.data ?? []).find((tag) => tag.name === normalizedTag);

      if (!existingTag) {
        await createTagMutation.mutateAsync({
          name: normalizedTag,
          color: color ?? TAG_COLORS[0],
        });
      }

      return normalizedTag;
    },
    [createTagMutation, tagsQuery.data],
  );

  const persistEntry = useCallback(
    async (draft: { content: string; tags?: string[]; mood?: MoodLevel | null }) => {
      const nextTags = uniqueTags(draft.tags ?? entry?.tags ?? []);
      const nextMood =
        draft.mood === undefined ? (entry?.mood ?? undefined) : draft.mood ?? null;
      const shouldPersist =
        Boolean(entry) ||
        draft.content.trim().length > 0 ||
        nextTags.length > 0 ||
        nextMood !== null;

      if (!shouldPersist) {
        setSaveState("idle");
        return;
      }

      markSaving();

      try {
        if (entry?.id) {
          await updateEntryMutation.mutateAsync({
            id: entry.id as JournalEntryId,
            content: draft.content,
            tags: nextTags,
            mood: nextMood,
            updatedAt: new Date(),
          });
        } else {
          const optimisticId =
            pendingEntryIdRef.current ?? (crypto.randomUUID() as JournalEntryId);
          pendingEntryIdRef.current = optimisticId;

          await createEntryMutation.mutateAsync({
            id: optimisticId,
            dateKey,
            content: draft.content,
            tags: nextTags,
            mood: nextMood ?? undefined,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }

        markSaved();
      } catch {
        markError();
      }
    },
    [createEntryMutation, dateKey, entry, markError, markSaved, markSaving, updateEntryMutation],
  );

  const schedulePersist = useCallback(
    (nextContent: string) => {
      clearPendingSave();
      saveTimeoutRef.current = setTimeout(() => {
        void persistEntry({ content: nextContent });
      }, CONTENT_SAVE_DEBOUNCE_MS);
    },
    [clearPendingSave, persistEntry],
  );

  const handleContentChange = useCallback(
    (newContent: string) => {
      setContent(newContent);
      schedulePersist(newContent);
    },
    [schedulePersist],
  );

  const handleMoodSelect = useCallback(
    (mood: MoodLevel) => {
      clearPendingSave();
      const nextMood = entry?.mood === mood ? null : mood;
      void persistEntry({ content, mood: nextMood });
    },
    [clearPendingSave, content, entry?.mood, persistEntry],
  );

  const handleAddTag = useCallback(
    (tagName: string, color?: CssColorValue) => {
      clearPendingSave();

      void (async () => {
        const normalizedTag = await ensureTag(tagName, color);
        const nextTags = uniqueTags([...(entry?.tags ?? []), normalizedTag]);
        await persistEntry({ content, tags: nextTags });
      })();
    },
    [clearPendingSave, content, ensureTag, entry?.tags, persistEntry],
  );

  const handleRemoveTag = useCallback(
    (tagName: string) => {
      clearPendingSave();
      const normalizedTag = normalizeTagName(tagName);
      const nextTags = (entry?.tags ?? []).filter((currentTag) => currentTag !== normalizedTag);
      void persistEntry({ content, tags: nextTags });
    },
    [clearPendingSave, content, entry?.tags, persistEntry],
  );

  const handleDeleteEntry = useCallback(() => {
    clearPendingSave();
    clearSaveStatusReset();

    if (!entry?.id) {
      setContent("");
      setSaveState("idle");
      return;
    }

    setSaveState("saving");
    void deleteEntryMutation
      .mutateAsync(entry.id as JournalEntryId)
      .then(() => {
        setContent("");
        pendingEntryIdRef.current = null;
        setSaveState("idle");
      })
      .catch(() => {
        setSaveState("error");
      });
  }, [clearPendingSave, clearSaveStatusReset, deleteEntryMutation, entry?.id]);

  const wordCount = useMemo(
    () => (content.trim() ? content.trim().split(/\s+/).length : 0),
    [content],
  );

  return {
    content,
    setContent: handleContentChange,
    entry,
    tags: tagsQuery.data,
    wordCount,
    saveState,
    handleMoodSelect,
    handleAddTag,
    handleRemoveTag,
    handleDeleteEntry,
  };
}
