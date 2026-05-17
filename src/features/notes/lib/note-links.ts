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
  return name.replace(/\.mdx?$/i, "");
}

export function normalizeNoteTitle(value: string): string {
  return stripMarkdownExtension(value)
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function extractHeadingTitle(content: string): string | null {
  const headingMatch = searchableContent(content).match(/^#\s+(.+?)\s*#*\s*$/m);
  return headingMatch?.[1]?.trim() || null;
}

export function getNoteTitle(note: Pick<NoteFile, "name" | "content">): string {
  return extractHeadingTitle(note.content) ?? stripMarkdownExtension(note.name);
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
    const keys = new Set([normalizeNoteTitle(file.name), normalizeNoteTitle(getNoteTitle(file))]);

    for (const key of keys) {
      if (!key) continue;
      const matches = index.get(key) ?? [];
      matches.push(file);
      index.set(key, matches);
    }
  }

  return index;
}

function buildNoteIdIndex(files: NoteFile[]): Map<string, NoteFile> {
  return new Map(files.map((file) => [file.id, file]));
}

function resolveNoteLinkWithIndexes(
  link: NoteLink,
  notesById: Map<string, NoteFile>,
  titleIndex: Map<string, NoteFile[]>,
): ResolvedNoteLink {
  if (link.targetNoteId) {
    const target = notesById.get(link.targetNoteId);
    return target
      ? { ...link, status: "resolved", targetNoteId: target.id }
      : { ...link, status: "unresolved" };
  }

  const matches = titleIndex.get(normalizeNoteTitle(link.targetLabel)) ?? [];

  if (matches.length === 1) {
    return { ...link, status: "resolved", targetNoteId: matches[0].id };
  }

  if (matches.length > 1) {
    return { ...link, status: "ambiguous" };
  }

  return { ...link, status: "unresolved" };
}

export function resolveNoteLink(link: NoteLink, files: NoteFile[]): ResolvedNoteLink {
  return resolveNoteLinkWithIndexes(link, buildNoteIdIndex(files), buildTitleIndex(files));
}

export function buildNoteLinkIndex(activeNote: NoteFile | null, files: NoteFile[]): NoteLinkIndex {
  if (!activeNote) {
    return {
      outgoing: [],
      backlinks: [],
      unresolvedOutgoing: [],
    };
  }

  const notesById = buildNoteIdIndex(files);
  const titleIndex = buildTitleIndex(files);
  const resolve = (link: NoteLink) => resolveNoteLinkWithIndexes(link, notesById, titleIndex);

  const outgoing = extractNoteLinks(activeNote).map(resolve);
  const backlinks = files
    .filter((file) => file.id !== activeNote.id)
    .flatMap((file) => extractNoteLinks(file).map(resolve))
    .filter((link) => link.status === "resolved" && link.targetNoteId === activeNote.id);

  return {
    outgoing,
    backlinks,
    unresolvedOutgoing: outgoing.filter((link) => link.status !== "resolved"),
  };
}
