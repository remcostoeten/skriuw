import type { NoteProperty, WorkspaceOperation } from "@skriuw/renderer-core/contracts/workspace";
import type { DocumentRecord } from "@skriuw/renderer-core/store/types";
import { commitOperations, type WorkspaceSession } from "../../bridge/commit";
import { newNodeId } from "../../shell/identity";
import type { DateKey } from "./dates";
import { appendParagraphs, emptyEntryDocument } from "./entry-document";
import {
  JOURNAL_DATE_PROPERTY_ID,
  JOURNAL_MOOD_PROPERTY_ID,
  JOURNAL_ROOT_ID,
  JOURNAL_ROOT_TITLE,
  MOOD_PROPERTY_OPTIONS,
  journalNoteIdForDate,
  type MoodLevel,
} from "./model";

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
 * The operations that put a journal entry for `dateKey` in the workspace: the
 * hidden `Journal` root when it is missing or trashed, the note, and the date
 * property that keys it. Separated from the commit so the capture queue can
 * batch a create and its append into one submission.
 */
export function journalEntryOperations(
  session: WorkspaceSession,
  noteId: string,
  dateKey: DateKey,
  at: number,
): WorkspaceOperation[] {
  const state = session.store.getState();
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
  return operations;
}

/**
 * Creating a note makes it the workspace's active note, which is right when a
 * hand made it in the tree and wrong for a journal entry: the notes column
 * keeps whatever was open there while the journal, and a capture arriving
 * behind it, work on their own day.
 */
function keepingActiveNote(session: WorkspaceSession, create: () => void): void {
  const before = session.store.getState();
  const activeNoteId = before.activeNoteId;
  const focusedNodeId = before.focusedNodeId;
  create();
  const after = session.store.getState();
  if (after.activeNoteId !== activeNoteId) {
    session.store.setActiveNote(activeNoteId);
  }
  if (after.focusedNodeId !== focusedNodeId) {
    session.store.setFocusedNode(focusedNodeId);
  }
}

/**
 * The entry note backing `dateKey`, created on first visit. The identifier
 * comes back in the same frame and the batch is submitted behind it, so
 * opening a day never waits on the native core (`docs/specs/mobile-app.md`,
 * R-P1).
 */
export function ensureJournalEntry(session: WorkspaceSession, dateKey: DateKey): string {
  const existing = journalNoteIdForDate(session.store.getState(), dateKey);
  if (existing !== null) {
    return existing;
  }
  const noteId = newNodeId();
  keepingActiveNote(session, () => {
    void commitOperations(
      session,
      journalEntryOperations(session, noteId, dateKey, Date.now()),
    ).catch(session.reportFailure);
  });
  return noteId;
}

/**
 * The same entry, but the caller waits for the workspace to take it. The
 * capture queue uses this: a record may only leave the queue once its entry
 * durably exists.
 */
export async function createJournalEntry(
  session: WorkspaceSession,
  noteId: string,
  dateKey: DateKey,
): Promise<void> {
  const operations = journalEntryOperations(session, noteId, dateKey, Date.now());
  let commit: Promise<void> = Promise.resolve();
  keepingActiveNote(session, () => {
    commit = commitOperations(session, operations);
  });
  await commit;
}

export function setJournalMood(
  session: WorkspaceSession,
  noteId: string,
  mood: MoodLevel | null,
): void {
  const properties = session.store.getState().propertiesByNoteId.get(noteId) ?? [];
  const existing = properties.find((property) => property.id === JOURNAL_MOOD_PROPERTY_ID);
  const at = Date.now();
  if (mood === null) {
    if (!existing) {
      return;
    }
    void commitOperations(session, [
      { type: "remove_note_property", noteId, propertyId: JOURNAL_MOOD_PROPERTY_ID, at },
    ]).catch(session.reportFailure);
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
  void commitOperations(session, [{ type: "set_note_property", property, at }]).catch(
    session.reportFailure,
  );
}

export type AppendRejection =
  | "unreadable-document"
  | "nothing-to-append"
  | "missing-document"
  | "revision-conflict";

export class JournalAppendError extends Error {
  readonly reason: AppendRejection;

  constructor(reason: AppendRejection, message: string) {
    super(message);
    this.name = "JournalAppendError";
    this.reason = reason;
  }
}

/**
 * The entry's current body, read from the hydrated store and fetched from the
 * bridge only when a note the snapshot did not carry is being appended to.
 */
async function entryDocument(session: WorkspaceSession, noteId: string): Promise<DocumentRecord> {
  const held = session.store.getState().documents.get(noteId);
  if (held !== undefined) {
    return held;
  }
  session.store.applyRemoteDocuments(await session.bridge.readWorkspaceDelta([noteId]));
  const fetched = session.store.getState().documents.get(noteId);
  if (fetched === undefined) {
    throw new JournalAppendError(
      "missing-document",
      `The journal entry ${noteId} has no document to append to.`,
    );
  }
  return fetched;
}

/**
 * Adds `lines` to the end of a journal entry as one `save_document` at the
 * revision the store holds, retrying once against the reloaded document when
 * another writer got there first — the same shape the desktop template fill
 * uses (`docs/specs/journal-daily.md`, "Starting from a template"). Anything
 * still rejected after the retry is thrown, so the capture queue keeps the
 * item instead of acknowledging a write that never happened.
 */
export async function appendToJournalEntry(
  session: WorkspaceSession,
  noteId: string,
  lines: readonly string[],
): Promise<void> {
  const at = Date.now();
  const document = await entryDocument(session, noteId);
  const appended = appendParagraphs(document.documentJson, document.markdown, lines);
  if (!appended.ok) {
    throw new JournalAppendError(
      appended.reason,
      appended.reason === "nothing-to-append"
        ? "A capture with no words was dropped before it reached the entry."
        : `The journal entry ${noteId} holds a document this build cannot append to.`,
    );
  }
  const save: WorkspaceOperation = {
    type: "save_document",
    noteId,
    documentJson: appended.body.documentJson,
    markdown: appended.body.markdown,
    wordCount: appended.body.wordCount,
    expectedRevision: document.revision,
    at,
  };
  try {
    await commitOperations(session, [save]);
  } catch (error) {
    await retryAppend(session, noteId, lines, error);
  }
}

async function retryAppend(
  session: WorkspaceSession,
  noteId: string,
  lines: readonly string[],
  cause: unknown,
): Promise<void> {
  session.store.applyRemoteDocuments(await session.bridge.readWorkspaceDelta([noteId]));
  const current = session.store.getState().documents.get(noteId);
  if (current === undefined) {
    throw cause;
  }
  const appended = appendParagraphs(current.documentJson, current.markdown, lines);
  if (!appended.ok) {
    throw cause;
  }
  await commitOperations(session, [
    {
      type: "save_document",
      noteId,
      documentJson: appended.body.documentJson,
      markdown: appended.body.markdown,
      wordCount: appended.body.wordCount,
      expectedRevision: current.revision,
      at: Date.now(),
    },
  ]);
}
