import { JOURNAL_ROOT_ID } from "@skriuw/renderer-core/journal/constants";
import type { RendererState, RendererStore } from "@skriuw/renderer-core/store/types";
import { flushPendingWork } from "@/store/pending-work";
import { activateNote } from "./navigation";
import { restoreSubtree, trashSubtrees } from "./operations";

type JsonNode = {
  type?: unknown;
  attrs?: { level?: unknown } | null;
  content?: unknown;
  text?: unknown;
};

function asJsonNode(value: unknown): JsonNode | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}

function childNodes(node: JsonNode): JsonNode[] {
  if (!Array.isArray(node.content)) {
    return [];
  }
  return node.content.flatMap((child) => {
    const parsed = asJsonNode(child);
    return parsed === null ? [] : [parsed];
  });
}

function inlineText(node: JsonNode): string | null {
  let text = "";
  for (const child of childNodes(node)) {
    if (child.type !== "text" || typeof child.text !== "string") {
      return null;
    }
    text += child.text;
  }
  return text;
}

function isTitleHeading(node: JsonNode, title: string): boolean {
  if (node.type !== "heading" || node.attrs?.level !== 1) {
    return false;
  }
  const text = inlineText(node);
  return text !== null && (text.trim() === "" || text.trim() === title);
}

function isBlankBlock(node: JsonNode): boolean {
  if (node.type !== "paragraph" && node.type !== "heading") {
    return false;
  }
  const text = inlineText(node);
  return text !== null && text.trim() === "";
}

function hasEmptyDocument(documentJson: unknown, title: string): boolean {
  const root = asJsonNode(documentJson);
  if (root === null || root.type !== "doc") {
    return false;
  }
  return childNodes(root).every(
    (block, index) => isBlankBlock(block) || (index === 0 && isTitleHeading(block, title)),
  );
}

function hasEmptyMarkdown(markdown: string, title: string): boolean {
  const body = markdown.trim();
  if (body === "") {
    return true;
  }
  // Matches a lone H1 line, optionally empty, and captures its text.
  const heading = /^#[ \t]*(.*)$/.exec(body);
  return heading !== null && [title, ""].includes((heading[1] ?? "").trim());
}

function isInJournal(state: RendererState, noteId: string): boolean {
  let parentId = state.sourceNodes.get(noteId)?.parentId ?? null;
  while (parentId !== null) {
    if (parentId === JOURNAL_ROOT_ID) {
      return true;
    }
    parentId = state.sourceNodes.get(parentId)?.parentId ?? null;
  }
  return false;
}

function isEmptyNote(state: RendererState, noteId: string): boolean {
  const node = state.sourceNodes.get(noteId);
  const document = state.documents.get(noteId);
  if (!node || node.kind !== "note" || node.deletedAt !== null || !document) {
    return false;
  }
  if (node.pinnedAt !== null || (node.lockedAt ?? null) !== null || document.sealed) {
    return false;
  }
  if (node.icon !== null || (node.coverImageId ?? null) !== null) {
    return false;
  }
  if ((node.coverGradient ?? null) !== null) {
    return false;
  }
  if ((state.childrenByParent.get(noteId)?.length ?? 0) > 0) {
    return false;
  }
  if ((state.propertiesByNoteId.get(noteId)?.length ?? 0) > 0) {
    return false;
  }
  if (isInJournal(state, noteId)) {
    return false;
  }
  const title = node.title.trim();
  return (
    hasEmptyMarkdown(document.markdown, title) && hasEmptyDocument(document.documentJson, title)
  );
}

/**
 * @name findEmptyNoteIds
 * @description Lists live notes with no body beyond an optional title heading.
 * Pinned, locked, journal, nested-parent, decorated and property-bearing notes
 * are never reported, and neither is any note with comment threads.
 *
 * @example
 * const emptyIds = findEmptyNoteIds(store.getState());
 */
export function findEmptyNoteIds(state: RendererState): string[] {
  const annotated = new Set<string>();
  for (const annotation of state.annotations.values()) {
    annotated.add(annotation.noteId);
  }
  return state.noteIds.filter((noteId) => !annotated.has(noteId) && isEmptyNote(state, noteId));
}

export type EmptyNoteCleanup = { noteIds: readonly string[] };

/**
 * @name trashEmptyNotes
 * @description Flushes pending edits, then moves every empty note to the trash
 * in one commit. When the open note is among them, the first remaining note
 * opens instead. Returns what was trashed so callers can offer an undo.
 *
 * @example
 * const cleanup = await trashEmptyNotes(store);
 * if (cleanup.noteIds.length > 0) restoreEmptyNotes(store, cleanup);
 */
export async function trashEmptyNotes(store: RendererStore): Promise<EmptyNoteCleanup> {
  await flushPendingWork();
  const state = store.getState();
  const noteIds = findEmptyNoteIds(state);
  if (noteIds.length === 0) {
    return { noteIds };
  }
  const removed = new Set(noteIds);
  const activeRemoved = state.activeNoteId !== null && removed.has(state.activeNoteId);
  trashSubtrees(store, noteIds);
  if (activeRemoved) {
    activateNote(store, state.noteIds.find((noteId) => !removed.has(noteId)) ?? null);
  }
  return { noteIds };
}

/**
 * @name restoreEmptyNotes
 * @description Undoes `trashEmptyNotes` by restoring every trashed note.
 *
 * @example
 * restoreEmptyNotes(store, cleanup);
 */
export function restoreEmptyNotes(store: RendererStore, cleanup: EmptyNoteCleanup): void {
  for (const noteId of cleanup.noteIds) {
    restoreSubtree(store, noteId);
  }
}

/**
 * @name describeEmptyNoteCount
 * @description Formats a count of empty notes for buttons and toasts.
 *
 * @example
 * describeEmptyNoteCount(3); // "3 empty notes"
 */
export function describeEmptyNoteCount(count: number): string {
  return count === 1 ? "1 empty note" : `${count} empty notes`;
}
