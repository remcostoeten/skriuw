import type { RendererState } from "@/store/types";
import { referenceKey } from "./types";
import type { EntityKind } from "./entity-manager-model";

export type EntityNoteReference = {
  noteId: string;
  title: string;
  updatedAt: number;
  snippet: string | null;
};

export type RelatedEntity = {
  kind: EntityKind;
  id: string;
  name: string;
  color: string | null;
  initials: string | null;
  sharedNotes: number;
};

export type EntityDetail = {
  notes: readonly EntityNoteReference[];
  related: readonly RelatedEntity[];
};

/**
 * Walking a document to place a mention in its sentence is the only unbounded
 * work on this projection, so it stops after the most recent notes. Entries
 * past the cut still render — they just show a title and a date.
 */
const SNIPPET_LIMIT = 40;
const RELATED_LIMIT = 12;
const SNIPPET_LEAD = 68;
const SNIPPET_TRAIL = 92;

type JsonNode = {
  type?: unknown;
  text?: unknown;
  attrs?: Record<string, unknown>;
  content?: unknown;
};

type ReferenceToken = {
  kind: EntityKind | "note";
  id: string;
  text: string;
};

function isJsonNode(value: unknown): value is JsonNode {
  return typeof value === "object" && value !== null;
}

function referenceToken(node: JsonNode): ReferenceToken | null {
  const attrs = node.attrs;
  if (!attrs || typeof attrs.id !== "string" || attrs.id.length === 0) {
    return null;
  }
  const label = typeof attrs.label === "string" ? attrs.label : "";
  if (node.type === "tag_ref") {
    return { kind: "tag", id: attrs.id, text: `#${label}` };
  }
  if (node.type === "mention_ref") {
    if (attrs.kind !== "person" && attrs.kind !== "note") {
      return null;
    }
    return {
      kind: attrs.kind,
      id: attrs.id,
      text: `${attrs.kind === "person" ? "$" : "@"}${label}`,
    };
  }
  return null;
}

function isInline(node: JsonNode): boolean {
  return (
    typeof node.text === "string" ||
    node.type === "tag_ref" ||
    node.type === "mention_ref" ||
    node.type === "hard_break"
  );
}

type BlockText = {
  text: string;
  matchAt: number | null;
  matchLength: number;
};

function renderBlock(
  children: readonly JsonNode[],
  kind: EntityKind,
  id: string,
): BlockText {
  let text = "";
  let matchAt: number | null = null;
  let matchLength = 0;
  for (const child of children) {
    if (typeof child.text === "string") {
      text += child.text;
      continue;
    }
    if (child.type === "hard_break") {
      text += " ";
      continue;
    }
    const token = referenceToken(child);
    if (!token) {
      continue;
    }
    if (matchAt === null && token.kind === kind && token.id === id) {
      matchAt = text.length;
      matchLength = token.text.length;
    }
    text += token.text;
  }
  return { text, matchAt, matchLength };
}

function excerpt(block: BlockText): string | null {
  if (block.matchAt === null) {
    return null;
  }
  const { text, matchAt, matchLength } = block;
  let start = Math.max(0, matchAt - SNIPPET_LEAD);
  if (start > 0) {
    const boundary = text.indexOf(" ", start);
    if (boundary !== -1 && boundary < matchAt) {
      start = boundary + 1;
    }
  }
  const end = Math.min(text.length, matchAt + matchLength + SNIPPET_TRAIL);
  const body = text.slice(start, end).replace(/\s+/g, " ").trim();
  if (body.length === 0) {
    return null;
  }
  return `${start > 0 ? "…" : ""}${body}${end < text.length ? "…" : ""}`;
}

/**
 * Returns the sentence a tag or person is mentioned in, rendered the way the
 * editor shows it (`#tag`, `$person`), or null when the document holds no
 * matching reference node.
 */
export function findMentionSnippet(
  documentJson: unknown,
  kind: EntityKind,
  id: string,
): string | null {
  const stack: unknown[] = [documentJson];
  while (stack.length > 0) {
    const value = stack.pop();
    if (!isJsonNode(value) || !Array.isArray(value.content)) {
      continue;
    }
    const children = value.content.filter(isJsonNode);
    if (children.some(isInline)) {
      const snippet = excerpt(renderBlock(children, kind, id));
      if (snippet !== null) {
        return snippet;
      }
      continue;
    }
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push(children[index]);
    }
  }
  return null;
}

type RelatedTally = {
  kind: EntityKind;
  id: string;
  sharedNotes: number;
};

function projectRelated(
  state: RendererState,
  kind: EntityKind,
  id: string,
  noteIds: readonly string[],
): RelatedEntity[] {
  const tallies = new Map<string, RelatedTally>();
  for (const noteId of noteIds) {
    for (const target of state.outgoingReferences.get(noteId) ?? []) {
      if (target.kind === "note" || (target.kind === kind && target.targetId === id)) {
        continue;
      }
      const key = referenceKey(target.kind, target.targetId);
      const tally = tallies.get(key);
      if (tally) {
        tally.sharedNotes += 1;
      } else {
        tallies.set(key, { kind: target.kind, id: target.targetId, sharedNotes: 1 });
      }
    }
  }
  const related: RelatedEntity[] = [];
  for (const tally of tallies.values()) {
    if (tally.kind === "tag") {
      const tag = state.tags.get(tally.id);
      if (tag) {
        related.push({
          kind: "tag",
          id: tag.id,
          name: tag.name,
          color: tag.color,
          initials: null,
          sharedNotes: tally.sharedNotes,
        });
      }
      continue;
    }
    const person = state.people.get(tally.id);
    if (person) {
      related.push({
        kind: "person",
        id: person.id,
        name: person.name,
        color: person.color,
        initials: person.initials,
        sharedNotes: tally.sharedNotes,
      });
    }
  }
  related.sort(
    (left, right) =>
      right.sharedNotes - left.sharedNotes || left.name.localeCompare(right.name),
  );
  return related.slice(0, RELATED_LIMIT);
}

export function projectEntityDetail(
  state: RendererState,
  kind: EntityKind,
  id: string,
): EntityDetail {
  const noteIds = state.incomingReferences.get(referenceKey(kind, id)) ?? [];
  const notes: EntityNoteReference[] = [];
  for (const noteId of noteIds) {
    const metadata = state.metadata.get(noteId);
    if (metadata) {
      notes.push({ noteId, title: metadata.title, updatedAt: metadata.updatedAt, snippet: null });
    }
  }
  notes.sort(
    (left, right) => right.updatedAt - left.updatedAt || left.title.localeCompare(right.title),
  );
  const snippetCount = Math.min(notes.length, SNIPPET_LIMIT);
  for (let index = 0; index < snippetCount; index += 1) {
    const entry = notes[index]!;
    const document = state.documents.get(entry.noteId);
    if (document) {
      notes[index] = {
        ...entry,
        snippet: findMentionSnippet(document.documentJson, kind, id),
      };
    }
  }
  return { notes, related: projectRelated(state, kind, id, noteIds) };
}

export function entityDetailEqual(left: EntityDetail, right: EntityDetail): boolean {
  if (left.notes.length !== right.notes.length || left.related.length !== right.related.length) {
    return false;
  }
  const sameNotes = left.notes.every((note, index) => {
    const other = right.notes[index];
    return (
      other !== undefined &&
      note.noteId === other.noteId &&
      note.title === other.title &&
      note.updatedAt === other.updatedAt &&
      note.snippet === other.snippet
    );
  });
  if (!sameNotes) {
    return false;
  }
  return left.related.every((entry, index) => {
    const other = right.related[index];
    return (
      other !== undefined &&
      entry.kind === other.kind &&
      entry.id === other.id &&
      entry.name === other.name &&
      entry.color === other.color &&
      entry.initials === other.initials &&
      entry.sharedNotes === other.sharedNotes
    );
  });
}
