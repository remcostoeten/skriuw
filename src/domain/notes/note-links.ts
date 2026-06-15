import type { NoteFile } from "@/types/notes";
import { richDocumentToSearchableMarkdown } from "@/domain/notes/rich-document";

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
	return stripMarkdownExtension(value).trim().replace(/\s+/g, " ").toLowerCase();
}

function extractHeadingTitle(content: string): string | null {
	const headingMatch = searchableContent(content).match(/^#\s+(.+?)\s*#*\s*$/m);
	return headingMatch?.[1]?.trim() || null;
}

export function getNoteTitle(note: Pick<NoteFile, "name" | "content">): string {
	return extractHeadingTitle(note.content) ?? stripMarkdownExtension(note.name);
}

export function getNoteSearchableContent(
	note: Pick<NoteFile, "content" | "richContent">,
): string {
	const markdown = note.content?.trim();
	if (markdown) {
		return note.content;
	}

	return richDocumentToSearchableMarkdown(note.richContent);
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
		for (const tag of [
			...(file.tags ?? []),
			...extractNoteTags(getNoteSearchableContent(file)),
		]) {
			tags.add(tag.toLowerCase());
		}
	}

	return [...tags].toSorted((left, right) => left.localeCompare(right));
}

export function extractNoteLinks(note: Pick<NoteFile, "id" | "content" | "richContent">): NoteLink[] {
	const links: NoteLink[] = [];
	const content = searchableContent(getNoteSearchableContent(note));

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
		const keys = new Set([
			normalizeNoteTitle(file.name),
			normalizeNoteTitle(getNoteTitle(file)),
		]);

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

export function findNoteByTitle(
	files: NoteFile[],
	title: string,
): NoteFile | null {
	const matches = buildTitleIndex(files).get(normalizeNoteTitle(title)) ?? [];

	if (matches.length === 1) {
		return matches[0];
	}

	return null;
}

/**
 * Like {@link findNoteByTitle}, but returns the first match even when the title
 * is ambiguous (more than one note shares it). Used by the wiki-link open/create
 * flow so an already-existing note is opened instead of spawning yet another
 * duplicate — which is what turns a single accidental duplicate into a cascade.
 */
export function findFirstNoteByTitle(
	files: NoteFile[],
	title: string,
): NoteFile | null {
	const matches = buildTitleIndex(files).get(normalizeNoteTitle(title)) ?? [];
	return matches[0] ?? null;
}

function dedupeLinks(
	links: ResolvedNoteLink[],
	keyFor: (link: ResolvedNoteLink) => string,
): ResolvedNoteLink[] {
	const seen = new Set<string>();
	const deduped: ResolvedNoteLink[] = [];

	for (const link of links) {
		const key = keyFor(link);
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		deduped.push(link);
	}

	return deduped;
}

function outgoingLinkKey(link: ResolvedNoteLink): string {
	if (link.status === "resolved" && link.targetNoteId) {
		return `resolved:${link.targetNoteId}`;
	}

	return `unresolved:${normalizeNoteTitle(link.targetLabel)}`;
}

function isSelfLink(link: ResolvedNoteLink, activeNote: NoteFile): boolean {
	if (link.status === "resolved" && link.targetNoteId === activeNote.id) {
		return true;
	}

	return (
		link.status !== "resolved" &&
		normalizeNoteTitle(link.targetLabel) === normalizeNoteTitle(getNoteTitle(activeNote))
	);
}

export function buildOutgoingNoteLinks(
	activeNote: NoteFile | null,
	files: NoteFile[],
): ResolvedNoteLink[] {
	if (!activeNote) return [];

	const notesById = buildNoteIdIndex(files);
	const titleIndex = buildTitleIndex(files);

	const links = extractNoteLinks(activeNote)
		.map((link) => resolveNoteLinkWithIndexes(link, notesById, titleIndex))
		.filter((link) => !isSelfLink(link, activeNote));

	return dedupeLinks(links, outgoingLinkKey);
}

export function buildNoteBacklinks(
	activeNote: NoteFile | null,
	files: NoteFile[],
): ResolvedNoteLink[] {
	if (!activeNote) return [];

	const notesById = buildNoteIdIndex(files);
	const titleIndex = buildTitleIndex(files);
	const resolve = (link: NoteLink) => resolveNoteLinkWithIndexes(link, notesById, titleIndex);

	const links = files
		.filter((file) => file.id !== activeNote.id)
		.flatMap((file) => extractNoteLinks(file).map(resolve))
		.filter((link) => link.status === "resolved" && link.targetNoteId === activeNote.id);

	return dedupeLinks(links, (link) => link.sourceNoteId);
}

export function buildNoteLinkIndex(activeNote: NoteFile | null, files: NoteFile[]): NoteLinkIndex {
	if (!activeNote) {
		return {
			outgoing: [],
			backlinks: [],
			unresolvedOutgoing: [],
		};
	}

	const outgoing = buildOutgoingNoteLinks(activeNote, files);
	const backlinks = buildNoteBacklinks(activeNote, files);

	return {
		outgoing,
		backlinks,
		unresolvedOutgoing: outgoing.filter((link) => link.status !== "resolved"),
	};
}
