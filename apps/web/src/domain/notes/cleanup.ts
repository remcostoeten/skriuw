import type { NoteFile } from "@/domain/notes/models";
import { richDocumentToSearchableMarkdown } from "@/domain/notes/rich-document";

export type CleanupReason = "empty" | "default" | "duplicate";

export type CleanupCandidate = {
	note: NoteFile;
	reason: CleanupReason;
	preview: string;
	duplicateOfName?: string;
};

export type CleanupScanResult = {
	candidates: CleanupCandidate[];
	scanned: number;
};

// Body of `generateNoteContent` (use-notes-layout.ts / global-notes-shortcuts.tsx)
// minus the `# <title>` heading, normalized the same way `normalizedBody` does.
// Notes are matched against this fuzzily so a starter note with a few stray
// keystrokes still counts as untouched.
const DEFAULT_NOTE_BODY =
	"#draft #idea start writing here. use # for tags, @ to mention notes, or /tag and /link note from the block editor.";

const DEFAULT_BODY_SIMILARITY_THRESHOLD = 0.8;
const MIN_DUPLICATE_BODY_LENGTH = 24;
const PREVIEW_LENGTH = 90;

function normalizedBody(note: NoteFile): string {
	const raw = note.content.trim().length
		? note.content
		: richDocumentToSearchableMarkdown(note.richContent);
	return raw
		.replace(/^#\s+.*$/m, "")
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase();
}

function bigramCounts(text: string): Map<string, number> {
	const counts = new Map<string, number>();
	for (let index = 0; index < text.length - 1; index += 1) {
		const gram = text.slice(index, index + 2);
		counts.set(gram, (counts.get(gram) ?? 0) + 1);
	}
	return counts;
}

/**
 * Sørensen–Dice similarity over character bigrams (0..1). Tolerant of small
 * insertions/typos anywhere in the string, which is exactly the "default text
 * plus 10-15% jibberish" case.
 */
export function textSimilarity(a: string, b: string): number {
	if (a === b) return 1;
	if (a.length < 2 || b.length < 2) return 0;
	const gramsA = bigramCounts(a);
	const gramsB = bigramCounts(b);
	let overlap = 0;
	for (const [gram, countA] of gramsA) {
		overlap += Math.min(countA, gramsB.get(gram) ?? 0);
	}
	return (2 * overlap) / (a.length - 1 + b.length - 1);
}

function previewOf(note: NoteFile, body: string): string {
	if (!body) return "(empty)";
	return body.length > PREVIEW_LENGTH ? `${body.slice(0, PREVIEW_LENGTH)}…` : body;
}

function isSweepable(note: NoteFile): boolean {
	if (note.access && note.access !== "owner") return false;
	if (note.journalMeta) return false;
	return true;
}

/**
 * Classify notes into trash candidates: empty bodies, bodies that are still
 * (approximately) the default new-note starter text, and exact duplicates of
 * another note's body. Duplicate groups keep the most recently modified note
 * and flag the rest. Shared and journal-backed notes are never flagged.
 */
export function findCleanupCandidates(notes: NoteFile[]): CleanupScanResult {
	const sweepable = notes.filter(isSweepable);
	const candidates: CleanupCandidate[] = [];
	const remaining: { note: NoteFile; body: string }[] = [];

	for (const note of sweepable) {
		const body = normalizedBody(note);
		if (!body) {
			candidates.push({ note, reason: "empty", preview: previewOf(note, body) });
			continue;
		}
		if (textSimilarity(body, DEFAULT_NOTE_BODY) >= DEFAULT_BODY_SIMILARITY_THRESHOLD) {
			candidates.push({ note, reason: "default", preview: previewOf(note, body) });
			continue;
		}
		remaining.push({ note, body });
	}

	const byBody = new Map<string, { note: NoteFile; body: string }[]>();
	for (const entry of remaining) {
		if (entry.body.length < MIN_DUPLICATE_BODY_LENGTH) continue;
		const group = byBody.get(entry.body);
		if (group) group.push(entry);
		else byBody.set(entry.body, [entry]);
	}

	for (const group of byBody.values()) {
		if (group.length < 2) continue;
		group.sort((a, b) => b.note.modifiedAt.getTime() - a.note.modifiedAt.getTime());
		const survivor = group[0]!;
		for (const entry of group.slice(1)) {
			candidates.push({
				note: entry.note,
				reason: "duplicate",
				preview: previewOf(entry.note, entry.body),
				duplicateOfName: survivor.note.name,
			});
		}
	}

	return { candidates, scanned: sweepable.length };
}
