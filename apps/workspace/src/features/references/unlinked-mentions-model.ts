import type { Node as ProseMirrorNode } from "prosemirror-model";
import { Transform } from "prosemirror-transform";
import type { WorkspaceOperation } from "@skriuw/renderer-core/contracts/workspace";
import type { DateKey } from "@skriuw/renderer-core/journal/dates";
import type { RendererState } from "@skriuw/renderer-core/store/types";
import { JOURNAL_ROOT_ID, journalEntryDateKey } from "@/features/journal/model";
import { countWords, productSchema, serializeProductMarkdown } from "@/features/editor/schema";
import { availableNote } from "./relationship-model";

export const UNLINKED_MENTION_CANDIDATE_LIMIT = 100;
export const UNLINKED_MENTIONS_PER_NOTE = 5;
export const UNLINKED_MENTION_LIMIT = 50;

const MINIMUM_TERM_LENGTH = 3;
const SNIPPET_BEFORE = 40;
const SNIPPET_AFTER = 60;
const GENERIC_TITLES = new Set([
  "untitled",
  "untitled note",
  "new note",
  "note",
  "notes",
  "draft",
  "inbox",
  "journal",
  "today",
  "todo",
]);
const EXCLUDED_MARKS = new Set(["code", "link"]);
// Scheme URLs and bare www hosts, up to the next whitespace or bracket.
const URL_PATTERN = /\b(?:[a-z][a-z\d+.-]*:\/\/|www\.)[^\s<>()[\]]+/giu;

export type UnlinkedMention = {
  noteId: string;
  title: string;
  dateKey: DateKey | null;
  blockIndex: number;
  from: number;
  to: number;
  text: string;
  before: string;
  after: string;
};

export type LinkedDocument = {
  noteId: string;
  linkedJson: unknown;
  previous: { documentJson: unknown; markdown: string; wordCount: number };
};

export type LinkMentionsPlan = {
  operations: WorkspaceOperation[];
  linked: LinkedDocument[];
  count: number;
};

type Match = Omit<UnlinkedMention, "noteId" | "title" | "dateKey">;

/**
 * @name unlinkedMentionTerm
 * @description Returns the text worth searching for as an unlinked mention of
 * a note title, or null when the title is too short, generic, or has no letters
 * to anchor a whole-word match.
 *
 * @example
 * unlinkedMentionTerm("  Project Alpha ") // "Project Alpha"
 * unlinkedMentionTerm("Untitled") // null
 */
export function unlinkedMentionTerm(title: string): string | null {
  const term = title.trim().replace(/\s+/gu, " ");
  if (
    [...term].length < MINIMUM_TERM_LENGTH ||
    GENERIC_TITLES.has(term.toLowerCase()) ||
    !/\p{L}/u.test(term)
  ) {
    return null;
  }
  return term;
}

/**
 * @name noteUnlinkedMentionTerm
 * @description Resolves the mention term for a workspace note. Journal entries
 * are titled by date and never produce a term.
 *
 * @example
 * const term = noteUnlinkedMentionTerm(store.getState(), noteId);
 */
export function noteUnlinkedMentionTerm(state: RendererState, noteId: string): string | null {
  if (
    state.nodes.get(noteId)?.kind !== "note" ||
    state.sourceNodes.get(noteId)?.parentId === JOURNAL_ROOT_ID
  ) {
    return null;
  }
  const title = state.metadata.get(noteId)?.title;
  return title === undefined ? null : unlinkedMentionTerm(title);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function termPattern(term: string): RegExp {
  const body = term.split(" ").map(escapeRegExp).join("\\s+");
  // Letters, digits, or underscore on either side would make this a partial word.
  return new RegExp(`(?<![\\p{L}\\p{N}_])${body}(?![\\p{L}\\p{N}_])`, "giu");
}

function urlRanges(text: string): Array<[number, number]> {
  return [...text.matchAll(URL_PATTERN)].map((match) => [
    match.index,
    match.index + match[0].length,
  ]);
}

function leafText(node: ProseMirrorNode): string {
  if (node.type.name === "mention_ref") {
    return `${node.attrs.kind === "person" ? "$" : "@"}${String(node.attrs.label)}`;
  }
  if (node.type.name === "tag_ref") {
    return `#${String(node.attrs.label)}`;
  }
  return node.type.name === "hard_break" ? " " : "";
}

function snippetBefore(block: ProseMirrorNode, end: number): string {
  const text = block.textBetween(0, end, " ", leafText).replace(/\s+/gu, " ").trimStart();
  return text.length > SNIPPET_BEFORE ? `…${text.slice(-SNIPPET_BEFORE).trimStart()}` : text;
}

function snippetAfter(block: ProseMirrorNode, start: number): string {
  const text = block
    .textBetween(start, block.content.size, " ", leafText)
    .replace(/\s+/gu, " ")
    .trimEnd();
  return text.length > SNIPPET_AFTER ? `${text.slice(0, SNIPPET_AFTER).trimEnd()}…` : text;
}

function textblockMatches(
  textblock: ProseMirrorNode,
  textblockStart: number,
  blockIndex: number,
  pattern: RegExp,
  limit: number,
  matches: Match[],
): void {
  textblock.forEach((child, childOffset) => {
    if (
      matches.length >= limit ||
      !child.isText ||
      child.marks.some((mark) => EXCLUDED_MARKS.has(mark.type.name))
    ) {
      return;
    }
    const text = child.text ?? "";
    const urls = urlRanges(text);
    for (const match of text.matchAll(pattern)) {
      if (matches.length >= limit) {
        return;
      }
      const start = match.index;
      const end = start + match[0].length;
      if (urls.some(([urlStart, urlEnd]) => start < urlEnd && end > urlStart)) {
        continue;
      }
      const localFrom = childOffset + start;
      const localTo = childOffset + end;
      matches.push({
        blockIndex,
        from: textblockStart + 1 + localFrom,
        to: textblockStart + 1 + localTo,
        text: match[0],
        before: snippetBefore(textblock, localFrom),
        after: snippetAfter(textblock, localTo),
      });
    }
  });
}

function documentMatches(document: ProseMirrorNode, term: string, limit: number): Match[] {
  const pattern = termPattern(term);
  const matches: Match[] = [];
  document.forEach((block, _offset, blockIndex) => {
    if (matches.length >= limit) {
      return;
    }
    if (block.isTextblock) {
      if (!block.type.spec.code && block.type.name !== "raw_markdown") {
        textblockMatches(block, 0, blockIndex, pattern, limit, matches);
      }
      return;
    }
    block.descendants((node, position) => {
      if (matches.length >= limit) {
        return false;
      }
      if (!node.isTextblock) {
        return true;
      }
      if (!node.type.spec.code && node.type.name !== "raw_markdown") {
        textblockMatches(node, position + 1, blockIndex, pattern, limit, matches);
      }
      return false;
    });
  });
  return matches;
}

const parsedDocuments = new WeakMap<object, ProseMirrorNode | null>();
const cachedMatches = new WeakMap<ProseMirrorNode, { term: string; matches: Match[] }>();

function parsedDocument(documentJson: unknown): ProseMirrorNode | null {
  if (typeof documentJson !== "object" || documentJson === null) {
    return null;
  }
  const cached = parsedDocuments.get(documentJson);
  if (cached !== undefined) {
    return cached;
  }
  let document: ProseMirrorNode | null;
  try {
    document = productSchema.nodeFromJSON(documentJson);
  } catch {
    document = null;
  }
  parsedDocuments.set(documentJson, document);
  return document;
}

function matchesFor(document: ProseMirrorNode, term: string): Match[] {
  const cached = cachedMatches.get(document);
  if (cached?.term === term) {
    return cached.matches;
  }
  const matches = documentMatches(document, term, UNLINKED_MENTIONS_PER_NOTE);
  cachedMatches.set(document, { term, matches });
  return matches;
}

function mentionSourceDocument(
  state: RendererState,
  noteId: string,
  candidateId: string,
): ProseMirrorNode | null {
  if (candidateId === noteId || !availableNote(state, candidateId)) {
    return null;
  }
  const record = state.documents.get(candidateId);
  if (!record || record.sealed) {
    return null;
  }
  return parsedDocument(record.documentJson);
}

/**
 * @name projectUnlinkedMentions
 * @description Lists plain-text occurrences of a note's title inside the
 * candidate notes, skipping the note itself, trashed or locked notes, code,
 * links, URLs, and existing note links. Parsing and matching are cached per
 * stored document, so re-running it after an unrelated store change is a
 * lookup per candidate.
 *
 * @example
 * const mentions = projectUnlinkedMentions(state, noteId, candidateIds);
 */
export function projectUnlinkedMentions(
  state: RendererState,
  noteId: string,
  candidateIds: readonly string[],
): UnlinkedMention[] {
  const term = noteUnlinkedMentionTerm(state, noteId);
  if (term === null) {
    return [];
  }
  const mentions: UnlinkedMention[] = [];
  for (const candidateId of candidateIds.slice(0, UNLINKED_MENTION_CANDIDATE_LIMIT)) {
    const document = mentionSourceDocument(state, noteId, candidateId);
    if (!document) {
      continue;
    }
    const title = state.metadata.get(candidateId)?.title ?? "Untitled";
    const dateKey =
      state.sourceNodes.get(candidateId)?.parentId === JOURNAL_ROOT_ID
        ? journalEntryDateKey(state, candidateId)
        : null;
    for (const match of matchesFor(document, term)) {
      mentions.push({ noteId: candidateId, title, dateKey, ...match });
      if (mentions.length >= UNLINKED_MENTION_LIMIT) {
        return mentions;
      }
    }
  }
  return mentions;
}

/**
 * @name unlinkedMentionKey
 * @description Stable identity of one mention within the stored document it
 * was found in.
 *
 * @example
 * <li key={unlinkedMentionKey(mention)} />
 */
export function unlinkedMentionKey(mention: UnlinkedMention): string {
  return `${mention.noteId}:${mention.blockIndex}:${mention.from}:${mention.to}`;
}

function sameMatch(left: Match, right: UnlinkedMention): boolean {
  return (
    left.blockIndex === right.blockIndex &&
    left.from === right.from &&
    left.to === right.to &&
    left.text === right.text
  );
}

function absoluteStart(document: ProseMirrorNode, blockIndex: number): number {
  let start = 0;
  for (let index = 0; index < blockIndex; index += 1) {
    start += document.child(index).nodeSize;
  }
  return start;
}

/**
 * @name planLinkMentions
 * @description Builds the document saves that turn the given plain-text
 * mentions into note links to `targetNoteId`. Each mention is re-verified
 * against the current stored document, so a stale row links nothing instead
 * of rewriting text that has since moved. The plan carries each document's
 * previous body for undo.
 *
 * @example
 * const plan = planLinkMentions(store.getState(), noteId, [mention]);
 * await commitOperations(store, plan.operations);
 */
export function planLinkMentions(
  state: RendererState,
  targetNoteId: string,
  mentions: readonly UnlinkedMention[],
): LinkMentionsPlan {
  const term = noteUnlinkedMentionTerm(state, targetNoteId);
  const label = state.metadata.get(targetNoteId)?.title;
  const mentionType = productSchema.nodes.mention_ref;
  const plan: LinkMentionsPlan = { operations: [], linked: [], count: 0 };
  if (term === null || label === undefined || !mentionType) {
    return plan;
  }
  const byNote = new Map<string, UnlinkedMention[]>();
  for (const mention of mentions) {
    byNote.set(mention.noteId, [...(byNote.get(mention.noteId) ?? []), mention]);
  }
  const at = Date.now();
  for (const [noteId, requested] of byNote) {
    const record = state.documents.get(noteId);
    const document = mentionSourceDocument(state, targetNoteId, noteId);
    if (!record || !document) {
      continue;
    }
    const current = documentMatches(document, term, Number.POSITIVE_INFINITY).filter((match) =>
      requested.some((mention) => sameMatch(match, mention)),
    );
    if (current.length === 0) {
      continue;
    }
    const transform = new Transform(document);
    const ordered = [...current].sort(
      (left, right) => right.blockIndex - left.blockIndex || right.from - left.from,
    );
    for (const match of ordered) {
      const start = absoluteStart(document, match.blockIndex);
      const marks = document.nodeAt(start + match.from)?.marks ?? [];
      transform.replaceWith(
        start + match.from,
        start + match.to,
        mentionType.create({ kind: "note", id: targetNoteId, label }, null, marks),
      );
    }
    const linkedDocument = transform.doc;
    const linkedJson = linkedDocument.toJSON();
    plan.operations.push({
      type: "save_document",
      noteId,
      documentJson: linkedJson,
      markdown: serializeProductMarkdown(linkedDocument),
      wordCount: countWords(linkedDocument),
      expectedRevision: record.revision,
      at,
    });
    plan.linked.push({
      noteId,
      linkedJson,
      previous: {
        documentJson: record.documentJson,
        markdown: record.markdown,
        wordCount: record.wordCount,
      },
    });
    plan.count += current.length;
  }
  return plan;
}

/**
 * @name planUnlinkMentions
 * @description Builds the saves that restore documents changed by
 * `planLinkMentions`. A document edited after linking is left alone and
 * reported, because restoring it would discard that edit.
 *
 * @example
 * const undo = planUnlinkMentions(store.getState(), plan.linked);
 * if (undo.operations.length > 0) await commitOperations(store, undo.operations);
 */
export function planUnlinkMentions(
  state: RendererState,
  linked: readonly LinkedDocument[],
): { operations: WorkspaceOperation[]; skipped: string[] } {
  const operations: WorkspaceOperation[] = [];
  const skipped: string[] = [];
  const at = Date.now();
  for (const entry of linked) {
    const record = state.documents.get(entry.noteId);
    if (!record || record.documentJson !== entry.linkedJson) {
      skipped.push(entry.noteId);
      continue;
    }
    operations.push({
      type: "save_document",
      noteId: entry.noteId,
      documentJson: entry.previous.documentJson,
      markdown: entry.previous.markdown,
      wordCount: entry.previous.wordCount,
      expectedRevision: record.revision,
      at,
    });
  }
  return { operations, skipped };
}
