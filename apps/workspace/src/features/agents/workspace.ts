import type { Node as ProseMirrorNode } from "prosemirror-model";
import type {
  NodePlacement,
  WorkspaceNode,
  WorkspaceOperation,
} from "@skriuw/renderer-core/contracts/workspace";
import { JOURNAL_ROOT_ID } from "@skriuw/renderer-core/journal/constants";
import type { RendererState } from "@skriuw/renderer-core/store/types";
import { deriveTitle } from "@/features/editor/note-title";
import {
  countWords,
  parseProductMarkdown,
  productSchema,
  serializeProductMarkdown,
} from "@/features/editor/schema";
import { documentSaveOperations } from "@/features/editor/tasks";
import { boundTitle } from "@/features/notes/title";
import { refuse } from "./protocol/input";

export const POSITIONS = ["first", "last"] as const;

export type Position = (typeof POSITIONS)[number];

/**
 * @name liveNode
 * @description The workspace node with `id` that is not in the trash, or a
 * refusal naming what is wrong with the id.
 *
 * @example
 * const folder = liveNode(state, input.text("folderId"));
 */
export function liveNode(state: RendererState, id: string): WorkspaceNode {
  const node = state.sourceNodes.get(id);
  if (node === undefined) refuse(`Nothing in the workspace has id ${id}.`);
  if (!state.nodes.has(id)) refuse(`${describe(node)} is in the trash. Restore it first.`);
  return node;
}

/**
 * @name liveFolder
 * @description Resolves a folder id for placing items; null is the workspace
 * root.
 *
 * @example
 * const parentId = liveFolder(state, input.nullableString("parentId") ?? null);
 */
export function liveFolder(state: RendererState, id: string | null): string | null {
  if (id === null) return null;
  const node = liveNode(state, id);
  if (node.kind !== "folder") refuse(`${describe(node)} is a note, not a folder.`);
  return node.id;
}

/**
 * @name editableNote
 * @description A live note an agent may read or write. Locked notes are
 * refused whether or not this session has unlocked them, so an agent never
 * reads what the owner chose to protect.
 *
 * @example
 * const note = editableNote(state, input.text("noteId"));
 */
export function editableNote(state: RendererState, id: string): WorkspaceNode {
  const node = liveNode(state, id);
  if (node.kind !== "note") refuse(`${describe(node)} is a folder, not a note.`);
  if (node.lockedAt != null)
    refuse(`${describe(node)} is locked. Agents cannot read or change it.`);
  return node;
}

/**
 * @name nodePath
 * @description The titles from the root down to the node, joined with " / ".
 *
 * @example
 * nodePath(state, "note-1"); // "Projects / Launch / Plan"
 */
export function nodePath(state: RendererState, id: string): string {
  const titles: string[] = [];
  let current = state.sourceNodes.get(id);
  while (current !== undefined && titles.length < 64) {
    titles.unshift(displayTitle(current));
    current = current.parentId === null ? undefined : state.sourceNodes.get(current.parentId);
  }
  return titles.join(" / ");
}

/**
 * @name displayTitle
 * @description A node's title, or "Untitled" when it has none.
 *
 * @example
 * displayTitle(node);
 */
export function displayTitle(node: WorkspaceNode): string {
  return node.title.trim().length > 0 ? node.title : "Untitled";
}

/**
 * @name placement
 * @description Where an item lands inside `parentId`: first or last, or
 * next to a sibling that must already live in that folder.
 *
 * @example
 * placement(state, "folder-1", { position: "last" });
 */
export function placement(
  state: RendererState,
  parentId: string | null,
  anchor: { position?: Position; beforeId?: string; afterId?: string },
): NodePlacement {
  const anchorId = anchor.beforeId ?? anchor.afterId;
  if (anchorId !== undefined) {
    const sibling = liveNode(state, anchorId);
    if (sibling.parentId !== parentId) {
      refuse(`${describe(sibling)} is not in the destination folder.`);
    }
    return {
      parentId,
      position:
        anchor.beforeId !== undefined ? { type: "before", anchorId } : { type: "after", anchorId },
    };
  }
  return { parentId, position: { type: anchor.position ?? "last" } };
}

/**
 * @name isJournal
 * @description Whether the node is the journal folder, which the journal
 * manages itself.
 *
 * @example
 * if (isJournal(id)) refuse("The journal cannot be moved.");
 */
export function isJournal(id: string): boolean {
  return id === JOURNAL_ROOT_ID;
}

/**
 * @name describe
 * @description Names a node for messages: its kind, title and id.
 *
 * @example
 * describe(node); // 'Folder "Projects" (folder-1)'
 */
export function describe(node: WorkspaceNode): string {
  return `${node.kind === "folder" ? "Folder" : "Note"} "${displayTitle(node)}" (${node.id})`;
}

/**
 * @name markdownDocument
 * @description Parses Markdown into the editor's document, the same parser the
 * raw editor and imports use.
 *
 * @example
 * const document = markdownDocument("# Plan\n\n- [ ] Ship");
 */
export function markdownDocument(markdown: string): ProseMirrorNode {
  return parseProductMarkdown(markdown);
}

/**
 * @name noteDocument
 * @description The stored document of a note an agent may edit.
 *
 * @example
 * const document = noteDocument(state, "note-1");
 */
export function noteDocument(state: RendererState, noteId: string): ProseMirrorNode {
  editableNote(state, noteId);
  const record = state.documents.get(noteId);
  if (record === undefined) refuse(`The body of note ${noteId} is not loaded.`);
  return productSchema.nodeFromJSON(record.documentJson);
}

/**
 * @name titledMarkdown
 * @description Markdown for a new note: the body as given when it already
 * opens with a heading, otherwise the title as a level-one heading above it,
 * because a note's title follows its first line.
 *
 * @example
 * titledMarkdown("Plan", "- [ ] Ship"); // "# Plan\n\n- [ ] Ship"
 */
export function titledMarkdown(title: string | undefined, body: string): string {
  const trimmed = body.trim();
  if (/^#{1,6}\s+\S/.test(trimmed)) return trimmed;
  const heading = title === undefined ? "" : `# ${title.replace(/\s+/g, " ").trim()}`;
  if (heading.length === 0) return trimmed;
  return trimmed.length === 0 ? `${heading}\n` : `${heading}\n\n${trimmed}`;
}

/**
 * @name createNoteOperation
 * @description The `create_note` operation for a parsed document, titled from
 * its first line like a note the editor saves.
 *
 * @example
 * createNoteOperation({ id, document, placement, at });
 */
export function createNoteOperation(note: {
  id: string;
  document: ProseMirrorNode;
  placement: NodePlacement;
  at: number;
}): WorkspaceOperation {
  return {
    type: "create_note",
    id: note.id,
    title: deriveTitle(note.document) || "Untitled",
    placement: note.placement,
    documentJson: note.document.toJSON(),
    markdown: serializeProductMarkdown(note.document),
    at: note.at,
  };
}

/**
 * @name saveDocumentOperations
 * @description The batch that stores a rewritten note the way the editor does:
 * linked checklist items are promoted to tasks in the same write, and the
 * note is renamed when its first line changed.
 *
 * @example
 * await context.commit(saveDocumentOperations(state, "note-1", document, Date.now()));
 */
export function saveDocumentOperations(
  state: RendererState,
  noteId: string,
  document: ProseMirrorNode,
  at: number,
): WorkspaceOperation[] {
  const record = state.documents.get(noteId);
  if (record === undefined) refuse(`The body of note ${noteId} is not loaded.`);
  const operations = documentSaveOperations(
    document,
    noteId,
    {
      documentJson: document.toJSON(),
      markdown: serializeProductMarkdown(document),
      wordCount: countWords(document),
      expectedRevision: record.revision,
    },
    state.tasks,
    at,
  );
  const previousTitle = deriveTitle(productSchema.nodeFromJSON(record.documentJson));
  const title = deriveTitle(document);
  const current = state.sourceNodes.get(noteId)?.title ?? "";
  if (title !== previousTitle && title.length > 0 && title !== current) {
    operations.push({ type: "rename_node", id: noteId, title: boundTitle(title), at });
  }
  return operations;
}
