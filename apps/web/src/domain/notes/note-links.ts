import type { NoteFile } from "@/types/notes";
import {
	extractRichDocumentUsers,
	richDocumentToSearchableMarkdown,
} from "@/domain/notes/rich-document";
import { isTagDetectionEnabled } from "@/domain/notes/tag-detection";

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
export const TAG_PATTERN = /(^|[\s([{])#([a-zA-Z][a-zA-Z0-9_-]{1,31})\b/g;
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

export function extractHeadingTitle(content: string): string | null {
	const headingMatch = searchableContent(content).match(/^#\s+(.+?)\s*#*\s*$/m);
	return headingMatch?.[1]?.trim() || null;
}

const UNTITLED_NAME_PATTERN = /^untitled(\s+\d+)?\.mdx?$/i;

/**
 * A note still carries its auto-generated name (`Untitled.md`, `Untitled 2.md`).
 * Used to gate the auto-rename-from-heading behavior so we never clobber a name
 * the user typed themselves.
 */
export function isUntitledNoteName(name: string): boolean {
	return UNTITLED_NAME_PATTERN.test(name.trim());
}

/**
 * Whether `name` is still the auto-managed, heading-derived filename rather than
 * a title the user typed themselves. True when the note is still "Untitled", or
 * when the name is exactly what the current heading in `content` would derive
 * to — i.e. it has been tracking the heading. This lets the filename keep
 * following the first heading as it's edited, while a manual rename (which makes
 * the name diverge from the heading) permanently opts out of the tracking.
 */
export function nameTracksHeading(name: string, content: string): boolean {
	if (isUntitledNoteName(name)) return true;
	const derived = deriveNoteNameFromHeading(content);
	return derived !== null && normalizeNoteTitle(derived) === normalizeNoteTitle(name);
}

// Characters that are illegal in filenames on common filesystems (the `name`
// doubles as a `.md` filename on desktop/export), plus control chars.
// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control chars from filenames is intentional
const FILENAME_UNSAFE_PATTERN = /[/\\:*?"<>|\x00-\x1f]/g;
const MAX_DERIVED_NAME_LENGTH = 120;

/**
 * Derive a note filename (`<heading>.md`) from the first H1 in `content`, or
 * `null` when there's no usable heading. The heading is sanitized into a safe
 * filename: unsafe chars stripped, whitespace collapsed, length capped.
 */
export function deriveNoteNameFromHeading(content: string): string | null {
	const heading = extractHeadingTitle(content);
	if (!heading) return null;
	const cleaned = heading
		.replace(FILENAME_UNSAFE_PATTERN, " ")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, MAX_DERIVED_NAME_LENGTH)
		.trim();
	return cleaned ? `${cleaned}.md` : null;
}

export function getNoteTitle(note: Pick<NoteFile, "name" | "content">): string {
	return extractHeadingTitle(note.content) ?? stripMarkdownExtension(note.name);
}

export function getNoteSearchableContent(note: Pick<NoteFile, "content" | "richContent">): string {
	const markdown = note.content?.trim();
	if (markdown) {
		return note.content;
	}

	return richDocumentToSearchableMarkdown(note.richContent);
}

export function extractNoteTags(content: string): string[] {
	if (!isTagDetectionEnabled()) return [];
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

export function getWorkspaceUsers(files: NoteFile[]): string[] {
	const users = new Map<string, string>();

	for (const file of files) {
		for (const user of extractRichDocumentUsers(file.richContent)) {
			users.set(user.toLowerCase(), user);
		}
	}

	return [...users.values()].toSorted((left, right) => left.localeCompare(right));
}

export function extractNoteLinks(
	note: Pick<NoteFile, "id" | "content" | "richContent">,
): NoteLink[] {
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

export type NoteLinkResolver = {
	resolve(link: NoteLink): ResolvedNoteLink;
	findFirstByTitle(title: string): NoteFile | null;
};

/**
 * Prebuilds the id/title indexes over `files` once so callers that resolve many
 * links against the same file set (every wiki-link chip in a rendered document)
 * pay O(files) a single time instead of per link. Build it in a memo keyed on
 * `files` and share it; each `resolve` is then a map lookup.
 */
export function createNoteLinkResolver(files: NoteFile[]): NoteLinkResolver {
	const notesById = buildNoteIdIndex(files);
	const titleIndex = buildTitleIndex(files);

	return {
		resolve(link) {
			return resolveNoteLinkWithIndexes(link, notesById, titleIndex);
		},
		findFirstByTitle(title) {
			return titleIndex.get(normalizeNoteTitle(title))?.[0] ?? null;
		},
	};
}

export function findNoteByTitle(files: NoteFile[], title: string): NoteFile | null {
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
export function findFirstNoteByTitle(files: NoteFile[], title: string): NoteFile | null {
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

	// A wiki link whose title is shared by multiple notes counts as a backlink
	// of each of them, matching the server's note_links resolution — ambiguity
	// surfaces more backlinks rather than hiding them.
	const activeTitleKeys = new Set(
		[normalizeNoteTitle(activeNote.name), normalizeNoteTitle(getNoteTitle(activeNote))].filter(
			Boolean,
		),
	);

	const links = files
		.filter((file) => file.id !== activeNote.id)
		.flatMap((file) => extractNoteLinks(file).map(resolve))
		.filter(
			(link) =>
				(link.status === "resolved" && link.targetNoteId === activeNote.id) ||
				(link.status === "ambiguous" &&
					!link.targetNoteId &&
					activeTitleKeys.has(normalizeNoteTitle(link.targetLabel))),
		)
		.map((link) =>
			link.status === "ambiguous"
				? { ...link, status: "resolved" as const, targetNoteId: activeNote.id }
				: link,
		);

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
