import type { NoteFile } from "@/types/notes";

export type NoteLinkKind = "wiki" | "markdown-note-link";

export type NoteLink = {
  raw: string;
  kind: NoteLinkKind;
  sourceNoteId: string;
  targetLabel: string;
  alias?: string;
  targetNoteId?: string;
};

export type ResolvedNoteLink = NoteLink & {
  status: "resolved" | "ambiguous" | "unresolved";
  targetNoteId?: string;
};

export type NoteLinkIndex = {
  outgoing: ResolvedNoteLink[];
  backlinks: ResolvedNoteLink[];
  unresolvedOutgoing: ResolvedNoteLink[];
};

const WIKI_LINK_PATTERN = /\[\[([^\]| \n][^\]|\n]*?)(?:\|([^\]\n]+?))?\]\]/g;
const MARKDOWN_LINK_PATTERN = /\[([^\]\n]+?)\]\((note:\/\/([^)#\s]+))\)/g;
const TAG_PATTERN = /(^|[\s([{])#([a-zA-Z][a-zA-Z0-9_-]{1,31})\b/g;
const FENCED_CODE_PATTERN = /```[\s\S]*?```/g;
const INLINE_CODE_PATTERN = /`[^`\n]*`/g;

function searchableContent(content: string): string {
  return content.replace(FENCED_CODE_PATTERN, " ").replace(INLINE_CODE_PATTERN, " ");
}

export function stripMarkdownExtension(name: string): string {
  return name.endsWith(".md") ? name.slice(0, -3) : name;
}

export function normalizeNoteTitle(value: string): string {
  return stripMarkdownExtension(value)
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function getNoteTitle(note: Pick<NoteFile, "name">): string {
  return stripMarkdownExtension(note.name);
}

export function extractNoteTags(content: string): string[] {
  const tags = new Set<string>();
  const source = searchableContent(content);

  for (const match of source.matchAll(TAG_PATTERN)) {
    const tag = match[2]?.trim().toLowerCase();
    if (tag) {
      tags.add(tag);
    }
  }

  return [...tags].toSorted((left, right) => left.localeCompare(right));
}

export function getWorkspaceTags(files: NoteFile[]): string[] {
  const tags = new Set<string>();

  for (const file of files) {
    for (const tag of [...(file.tags ?? []), ...extractNoteTags(file.content)]) {
      tags.add(tag.toLowerCase());
    }
  }

  return [...tags].toSorted((left, right) => left.localeCompare(right));
}

export function extractNoteLinks(note: Pick<NoteFile, "id" | "content">): NoteLink[] {
  const links: NoteLink[] = [];
  const content = searchableContent(note.content);

  for (const match of content.matchAll(WIKI_LINK_PATTERN)) {
    const targetLabel = match[1]?.trim();
    if (!targetLabel) {
      continue;
    }

    links.push({
      raw: match[0],
      kind: "wiki",
      sourceNoteId: note.id,
      targetLabel,
      alias: match[2]?.trim() || undefined,
    });
  }

  for (const match of content.matchAll(MARKDOWN_LINK_PATTERN)) {
    const targetLabel = match[1]?.trim();
    const targetNoteId = match[3]?.trim();
    if (!targetLabel || !targetNoteId) {
      continue;
    }

    links.push({
      raw: match[0],
      kind: "markdown-note-link",
      sourceNoteId: note.id,
      targetLabel,
      targetNoteId,
    });
  }

  return links;
}

function buildTitleIndex(files: NoteFile[]): Map<string, NoteFile[]> {
  const index = new Map<string, NoteFile[]>();

  for (const file of files) {
    const key = normalizeNoteTitle(file.name);
    const matches = index.get(key) ?? [];
    matches.push(file);
    index.set(key, matches);
  }

  return index;
}

export function resolveNoteLink(link: NoteLink, files: NoteFile[]): ResolvedNoteLink {
  if (link.targetNoteId) {
    const target = files.find((file) => file.id === link.targetNoteId);
    return target
      ? { ...link, status: "resolved", targetNoteId: target.id }
      : { ...link, status: "unresolved" };
  }

  const matches = buildTitleIndex(files).get(normalizeNoteTitle(link.targetLabel)) ?? [];

  if (matches.length === 1) {
    return { ...link, status: "resolved", targetNoteId: matches[0].id };
  }

  if (matches.length > 1) {
    return { ...link, status: "ambiguous" };
  }

  return { ...link, status: "unresolved" };
}

export function buildNoteLinkIndex(activeNote: NoteFile | null, files: NoteFile[]): NoteLinkIndex {
  if (!activeNote) {
    return {
      outgoing: [],
      backlinks: [],
      unresolvedOutgoing: [],
    };
  }

  const outgoing = extractNoteLinks(activeNote).map((link) => resolveNoteLink(link, files));
  const backlinks = files
    .filter((file) => file.id !== activeNote.id)
    .flatMap((file) => extractNoteLinks(file).map((link) => resolveNoteLink(link, files)))
    .filter((link) => link.status === "resolved" && link.targetNoteId === activeNote.id);

  return {
    outgoing,
    backlinks,
    unresolvedOutgoing: outgoing.filter((link) => link.status !== "resolved"),
  };
}
