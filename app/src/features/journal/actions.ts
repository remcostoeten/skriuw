import { commitOperations, trashSubtree } from "@/store/actions/workspace";
import type { NoteProperty, WorkspaceOperation } from "@/contracts/workspace";
import type { RendererStore } from "@/store/types";
import type { DateKey } from "./dates";
import {
  JOURNAL_DATE_PROPERTY_ID,
  JOURNAL_MOOD_PROPERTY_ID,
  JOURNAL_ROOT_ID,
  JOURNAL_ROOT_TITLE,
  MOOD_PROPERTY_OPTIONS,
  journalNoteIdForDate,
  type MoodLevel,
} from "./model";

function reportRejection(action: string) {
  return (error: unknown) => {
    console.error(`${action} rejected`, error);
  };
}

function emptyEntryDocument() {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

function dateProperty(noteId: string, dateKey: DateKey): NoteProperty {
  return {
    noteId,
    id: JOURNAL_DATE_PROPERTY_ID,
    name: "Date",
    value: { valueVersion: 1, type: "date", value: dateKey },
    options: [],
    position: 0,
  };
}

/**
 * The entry note backing `dateKey`, created on first visit. Creation never
 * touches the workspace's active note, so the notes route keeps whatever was
 * open there.
 */
export function ensureJournalEntry(store: RendererStore, dateKey: DateKey): string {
  const state = store.getState();
  const existing = journalNoteIdForDate(state, dateKey);
  if (existing !== null) {
    return existing;
  }
  const noteId = crypto.randomUUID();
  const at = Date.now();
  const operations: WorkspaceOperation[] = [];
  const root = state.sourceNodes.get(JOURNAL_ROOT_ID);
  if (!root) {
    operations.push({
      type: "create_folder",
      id: JOURNAL_ROOT_ID,
      title: JOURNAL_ROOT_TITLE,
      placement: { parentId: null, position: { type: "last" } },
      at,
    });
  } else if (root.deletedAt !== null) {
    operations.push({
      type: "restore_subtree",
      rootId: JOURNAL_ROOT_ID,
      placement: { parentId: null, position: { type: "last" } },
      at,
    });
  }
  operations.push(
    {
      type: "create_note",
      id: noteId,
      title: "Untitled",
      placement: { parentId: JOURNAL_ROOT_ID, position: { type: "last" } },
      documentJson: emptyEntryDocument(),
      markdown: "",
      at,
    },
    { type: "set_note_property", property: dateProperty(noteId, dateKey), at },
  );
  void commitOperations(store, operations).catch(reportRejection("create journal entry"));
  return noteId;
}

export function setJournalMood(
  store: RendererStore,
  noteId: string,
  mood: MoodLevel | null,
): void {
  const properties = store.getState().propertiesByNoteId.get(noteId) ?? [];
  const existing = properties.find((property) => property.id === JOURNAL_MOOD_PROPERTY_ID);
  const at = Date.now();
  if (mood === null) {
    if (!existing) {
      return;
    }
    void commitOperations(store, [
      { type: "remove_note_property", noteId, propertyId: JOURNAL_MOOD_PROPERTY_ID, at },
    ]).catch(reportRejection("clear journal mood"));
    return;
  }
  const property: NoteProperty = {
    noteId,
    id: JOURNAL_MOOD_PROPERTY_ID,
    name: "Mood",
    value: { valueVersion: 1, type: "select", value: mood },
    options: MOOD_PROPERTY_OPTIONS.map((option) => ({ ...option })),
    position: existing?.position ?? properties.length,
  };
  void commitOperations(store, [{ type: "set_note_property", property, at }]).catch(
    reportRejection("set journal mood"),
  );
}

export function deleteJournalEntry(store: RendererStore, noteId: string): void {
  trashSubtree(store, noteId);
}
