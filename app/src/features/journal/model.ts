import type { NoteProperty, NotePropertyOption } from "@/contracts/workspace";
import type { RendererState } from "@/store/types";
import { isDateKey, type DateKey } from "./dates";
import { journalEntryTagIds } from "./tags";

import {
  JOURNAL_DATE_PROPERTY_ID,
  JOURNAL_MOOD_PROPERTY_ID,
  JOURNAL_ROOT_ID,
  JOURNAL_ROOT_TITLE,
} from "./constants";

export {
  JOURNAL_DATE_PROPERTY_ID,
  JOURNAL_MOOD_PROPERTY_ID,
  JOURNAL_ROOT_ID,
  JOURNAL_ROOT_TITLE,
};

export type MoodLevel = "great" | "good" | "neutral" | "low" | "rough";

export type Mood = {
  level: MoodLevel;
  label: string;
  icon: string;
  colorClass: string;
};

export const MOOD_LEVELS: readonly MoodLevel[] = [
  "great",
  "good",
  "neutral",
  "low",
  "rough",
];

export const MOOD_OPTIONS: Record<MoodLevel, Mood> = {
  great: { level: "great", label: "Great", icon: "++", colorClass: "text-emerald-500" },
  good: { level: "good", label: "Good", icon: "+", colorClass: "text-teal-500" },
  neutral: { level: "neutral", label: "Neutral", icon: "~", colorClass: "text-muted-foreground" },
  low: { level: "low", label: "Low", icon: "-", colorClass: "text-amber-500" },
  rough: { level: "rough", label: "Rough", icon: "--", colorClass: "text-red-500" },
};

/** Select options persisted on the mood property, so archives stay valid. */
export const MOOD_PROPERTY_OPTIONS: NotePropertyOption[] = [
  { id: "great", label: "Great", color: "green" },
  { id: "good", label: "Good", color: "teal" },
  { id: "neutral", label: "Neutral", color: "gray" },
  { id: "low", label: "Low", color: "amber" },
  { id: "rough", label: "Rough", color: "red" },
];

export function isMoodLevel(value: string): value is MoodLevel {
  return (MOOD_LEVELS as readonly string[]).includes(value);
}

export type JournalEntry = {
  noteId: string;
  dateKey: DateKey;
  title: string;
  mood: MoodLevel | null;
  wordCount: number;
  tagIds: readonly string[];
};

function propertyOf(
  state: RendererState,
  noteId: string,
  propertyId: string,
): NoteProperty | undefined {
  return state.propertiesByNoteId
    .get(noteId)
    ?.find((property) => property.id === propertyId);
}

export function journalEntryDateKey(state: RendererState, noteId: string): DateKey | null {
  const property = propertyOf(state, noteId, JOURNAL_DATE_PROPERTY_ID);
  if (property?.value.type !== "date" || !isDateKey(property.value.value)) {
    return null;
  }
  return property.value.value;
}

export function journalEntryMood(state: RendererState, noteId: string): MoodLevel | null {
  const property = propertyOf(state, noteId, JOURNAL_MOOD_PROPERTY_ID);
  if (property?.value.type !== "select") {
    return null;
  }
  const value = property.value.value;
  return value !== null && isMoodLevel(value) ? value : null;
}

/** Whether an entry carries anything worth surfacing on calendar and lists. */
function hasSubstance(entry: JournalEntry): boolean {
  return entry.wordCount > 0 || entry.mood !== null;
}

/**
 * Every available journal entry, newest day first. Days opened but never
 * written to (no words, no mood) stay out, so browsing the calendar never
 * fabricates visible entries.
 */
export function selectJournalEntries(state: RendererState): JournalEntry[] {
  const childIds = state.childrenByParent.get(JOURNAL_ROOT_ID);
  if (!childIds || childIds.length === 0) {
    return [];
  }
  const entries: JournalEntry[] = [];
  for (const noteId of childIds) {
    if (state.nodes.get(noteId)?.kind !== "note") {
      continue;
    }
    const dateKey = journalEntryDateKey(state, noteId);
    if (dateKey === null) {
      continue;
    }
    const metadata = state.metadata.get(noteId);
    const entry: JournalEntry = {
      noteId,
      dateKey,
      title: metadata?.title ?? "Untitled",
      mood: journalEntryMood(state, noteId),
      wordCount: metadata?.wordCount ?? 0,
      tagIds: journalEntryTagIds(state, noteId),
    };
    if (hasSubstance(entry)) {
      entries.push(entry);
    }
  }
  entries.sort((left, right) => right.dateKey.localeCompare(left.dateKey));
  return entries;
}

export function sameJournalEntries(
  left: readonly JournalEntry[],
  right: readonly JournalEntry[],
): boolean {
  return (
    left.length === right.length &&
    left.every((entry, index) => {
      const other = right[index];
      return (
        other !== undefined &&
        entry.noteId === other.noteId &&
        entry.dateKey === other.dateKey &&
        entry.title === other.title &&
        entry.mood === other.mood &&
        entry.wordCount === other.wordCount &&
        entry.tagIds.length === other.tagIds.length &&
        entry.tagIds.every((tagId, tagIndex) => tagId === other.tagIds[tagIndex])
      );
    })
  );
}

/**
 * The entry note for a calendar day, including still-empty ones, so opening
 * a day reuses the note it already created.
 */
export function journalNoteIdForDate(state: RendererState, dateKey: DateKey): string | null {
  const childIds = state.childrenByParent.get(JOURNAL_ROOT_ID) ?? [];
  for (const noteId of childIds) {
    if (
      state.nodes.get(noteId)?.kind === "note" &&
      journalEntryDateKey(state, noteId) === dateKey
    ) {
      return noteId;
    }
  }
  return null;
}

export function selectEntryDateKeys(state: RendererState): ReadonlySet<DateKey> {
  return new Set(selectJournalEntries(state).map((entry) => entry.dateKey));
}

export function sameDateKeySet(
  left: ReadonlySet<DateKey>,
  right: ReadonlySet<DateKey>,
): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const key of left) {
    if (!right.has(key)) {
      return false;
    }
  }
  return true;
}
