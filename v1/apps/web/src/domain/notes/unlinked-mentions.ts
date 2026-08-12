import type { NoteFile } from "@/types/notes";
import {
	getNoteSearchableContent,
	getNoteTitle,
	normalizeNoteTitle,
	stripMarkdownExtension,
} from "@/domain/notes/note-links";

export type UnlinkedMention = {
	noteId: string;
	phrase: string;
	preview: string;
	count: number;
};

const LINK_TOKEN_PATTERN = /\[\[[^\]]*\]\]|\[[^\]\n]+\]\(note:\/\/[^)]*\)/gi;
const FENCED_CODE_PATTERN = /```[\s\S]*?```/g;
const INLINE_CODE_PATTERN = /`[^`\n]*`/g;
const MIN_PHRASE_LENGTH = 3;
const PREVIEW_RADIUS = 42;

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripLinksAndCode(content: string): string {
	return content
		.replace(FENCED_CODE_PATTERN, " ")
		.replace(INLINE_CODE_PATTERN, " ")
		.replace(LINK_TOKEN_PATTERN, " ");
}

function getMentionPhrases(activeNote: NoteFile): string[] {
	const phrases = new Map<string, string>();

	for (const candidate of [getNoteTitle(activeNote), stripMarkdownExtension(activeNote.name)]) {
		const trimmed = candidate.trim();
		const key = normalizeNoteTitle(trimmed);
		if (trimmed.length < MIN_PHRASE_LENGTH || !key) continue;
		if (!phrases.has(key)) {
			phrases.set(key, trimmed);
		}
	}

	return [...phrases.values()];
}

function buildMentionPattern(phrases: string[]): RegExp {
	const alternation = phrases.map(escapeRegExp).join("|");
	return new RegExp(`(?<![\\w-])(${alternation})(?![\\w-])`, "gi");
}

function buildPreview(text: string, index: number, length: number): string {
	const start = Math.max(0, index - PREVIEW_RADIUS);
	const end = Math.min(text.length, index + length + PREVIEW_RADIUS);
	const snippet = text.slice(start, end).replace(/\s+/g, " ").trim();
	const prefix = start > 0 ? "…" : "";
	const suffix = end < text.length ? "…" : "";
	return `${prefix}${snippet}${suffix}`;
}

/**
 * Finds other notes whose plain text names `activeNote` without an existing
 * wiki/note link. Existing link tokens and code spans are stripped before the
 * scan so only genuinely unlinked mentions surface. Returns one entry per
 * mentioning note, carrying the exact phrase and a context preview.
 */
export function findUnlinkedMentions(
	activeNote: NoteFile | null,
	files: NoteFile[],
): UnlinkedMention[] {
	if (!activeNote) return [];

	const phrases = getMentionPhrases(activeNote);
	if (phrases.length === 0) return [];

	const pattern = buildMentionPattern(phrases);
	const mentions: UnlinkedMention[] = [];

	for (const file of files) {
		if (file.id === activeNote.id) continue;

		const text = stripLinksAndCode(getNoteSearchableContent(file));
		pattern.lastIndex = 0;

		let count = 0;
		let firstPhrase = "";
		let preview = "";
		let match: RegExpExecArray | null = pattern.exec(text);
		while (match !== null) {
			if (count === 0) {
				firstPhrase = match[1];
				preview = buildPreview(text, match.index, match[1].length);
			}
			count += 1;
			match = pattern.exec(text);
		}

		if (count > 0) {
			mentions.push({ noteId: file.id, phrase: firstPhrase, preview, count });
		}
	}

	return mentions;
}

/**
 * Rewrites the first standalone occurrence of `phrase` in `content` into a
 * `[[phrase]]` wiki link, skipping matches that already sit inside a link token.
 * Returns the updated markdown, or `null` when no linkable occurrence exists.
 */
export function linkifyFirstMention(content: string, phrase: string): string | null {
	const escaped = escapeRegExp(phrase);
	const pattern = new RegExp(
		`(\\[\\[[^\\]]*\\]\\]|\\[[^\\]\\n]+\\]\\(note:\\/\\/[^)]*\\)|\`[^\`\\n]*\`)|(?<![\\w-])(${escaped})(?![\\w-])`,
		"gi",
	);

	let replaced = false;
	const next = content.replace(pattern, (whole, linkToken, mention) => {
		if (linkToken || replaced || mention === undefined) {
			return whole;
		}
		replaced = true;
		return `[[${mention}]]`;
	});

	return replaced ? next : null;
}
