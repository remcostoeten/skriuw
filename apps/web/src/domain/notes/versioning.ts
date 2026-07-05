import { createHash } from "node:crypto";
import type { NoteFile, NoteVersionReason } from "./models";

// Autosaves/checkpoints landing within this window of the latest stored
// autosave/checkpoint row overwrite it in place instead of inserting, so a
// typing burst yields one version instead of one per save.
export const NOTE_VERSION_COALESCE_WINDOW_MS = 60 * 1000;
// Edits whose changed region is at most this many characters are noise
// (a typo fix, one or two letters) and never worth a version on their own.
export const NOTE_VERSION_TRIVIAL_CHAR_DELTA = 2;
// Hard cap on stored versions per note; older rows are pruned on insert so the
// note_versions table (full content snapshots) cannot grow unbounded.
export const NOTE_VERSION_RETENTION_LIMIT = 200;

// Structural on purpose: callers pass a lean Prisma select, not a full
// NoteVersion, so the latest-version check never loads richContent JSON.
export type LatestNoteVersionSnapshot = {
	id: string;
	contentHash: string;
	createdAt: Date;
	content: string;
	reason: string;
} | null;

export type NoteVersionDecision =
	| { action: "skip" }
	| { action: "insert" }
	| { action: "coalesce"; versionId: string };

export type NoteVersionCandidate = Pick<
	NoteFile,
	"name" | "content" | "richContent" | "preferredEditorMode" | "parentId" | "tags" | "properties"
> & {
	reason: NoteVersionReason;
};

export function normalizeVersionTags(tags: string[] | undefined): string[] {
	return [
		...new Set((tags ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean)),
	].toSorted((left, right) => left.localeCompare(right));
}

export function buildNoteVersionContentHash(candidate: NoteVersionCandidate): string {
	const payload = JSON.stringify({
		name: candidate.name,
		content: candidate.content,
		richContent: candidate.richContent,
		preferredEditorMode: candidate.preferredEditorMode,
		parentId: candidate.parentId,
		tags: normalizeVersionTags(candidate.tags),
		properties: candidate.properties ?? [],
	});

	return createHash("sha256").update(payload).digest("hex");
}

function countWords(content: string): number {
	return content.split(/\s+/).filter(Boolean).length;
}

function countChars(content: string): number {
	return content.length;
}

// The differing middle of two strings after stripping their common prefix and
// suffix — a cheap stand-in for edit distance that correctly sees same-length
// replacements (where a raw length delta reads as zero change).
function changedRegions(prev: string, next: string): [string, string] {
	let start = 0;
	while (start < prev.length && start < next.length && prev[start] === next[start]) {
		start += 1;
	}
	let prevEnd = prev.length;
	let nextEnd = next.length;
	while (prevEnd > start && nextEnd > start && prev[prevEnd - 1] === next[nextEnd - 1]) {
		prevEnd -= 1;
		nextEnd -= 1;
	}
	return [prev.slice(start, prevEnd), next.slice(start, nextEnd)];
}

function isTrivialContentEdit(prev: string, next: string): boolean {
	if (prev === next) {
		return false;
	}
	const strip = (value: string) => value.replace(/\s+/g, "");
	if (strip(prev) === strip(next)) {
		return true;
	}
	const [prevRegion, nextRegion] = changedRegions(prev, next);
	return Math.max(prevRegion.length, nextRegion.length) <= NOTE_VERSION_TRIVIAL_CHAR_DELTA;
}

function coalescesWith(reason: string): boolean {
	return reason === "autosave" || reason === "checkpoint";
}

/**
 * Decides how to persist a snapshot given the note's latest stored version:
 * identical hash → skip; explicit reasons (created/rename/restore) → insert;
 * whitespace-only or ≤2-char edits → skip; within the coalesce window of the
 * latest autosave/checkpoint row → overwrite that row; otherwise insert.
 */
export function decideNoteVersionPersistence(
	candidate: NoteVersionCandidate & { createdAt: Date },
	latestVersion: LatestNoteVersionSnapshot,
): NoteVersionDecision {
	if (!latestVersion) {
		return { action: "insert" };
	}

	const nextHash = buildNoteVersionContentHash(candidate);
	if (nextHash === latestVersion.contentHash) {
		return { action: "skip" };
	}

	if (!coalescesWith(candidate.reason)) {
		return { action: "insert" };
	}

	if (isTrivialContentEdit(latestVersion.content, candidate.content)) {
		return { action: "skip" };
	}

	const elapsed = candidate.createdAt.getTime() - latestVersion.createdAt.getTime();
	if (coalescesWith(latestVersion.reason) && elapsed < NOTE_VERSION_COALESCE_WINDOW_MS) {
		return { action: "coalesce", versionId: latestVersion.id };
	}

	return { action: "insert" };
}

export function summarizeNoteVersionReason(reason: NoteVersionReason): string {
	switch (reason) {
		case "created":
			return "Initial version";
		case "rename":
			return "Metadata update";
		case "restore":
			return "Restored checkpoint";
		case "checkpoint":
			return "Checkpoint";
		case "autosave":
		default:
			return "Autosaved checkpoint";
	}
}

export type NoteVersionDeltaValues = {
	wordDelta: number;
	charDelta: number;
};

export function getNoteVersionDeltaValues(
	currentContent: string,
	previousContent?: string,
): NoteVersionDeltaValues | null {
	if (!previousContent) {
		return null;
	}

	const currentWords = countWords(currentContent);
	const previousWords = countWords(previousContent);
	const currentChars = countChars(currentContent);
	const previousChars = countChars(previousContent);

	return {
		wordDelta: currentWords - previousWords,
		charDelta: currentChars - previousChars,
	};
}

export function formatNoteVersionDelta(currentContent: string, previousContent?: string): string {
	const values = getNoteVersionDeltaValues(currentContent, previousContent);
	if (!values) {
		return "+0 -0";
	}

	const wordLabel = values.wordDelta >= 0 ? `+${values.wordDelta}` : `${values.wordDelta}`;
	const charLabel = values.charDelta >= 0 ? `+${values.charDelta}` : `${values.charDelta}`;

	return `${wordLabel} ${charLabel}`;
}

export function previewVersionContent(content: string): string[] {
	return content
		.split("\n")
		.map((line) => line.trimEnd())
		.filter((line) => line.trim().length > 0)
		.slice(0, 3);
}

export function getVersionContextPreview(content: string, maxLength = 52): string | null {
	const lines = previewVersionContent(content);
	if (lines.length === 0) return null;

	const first = lines[0].replace(/^#+\s+/, "").trim();
	if (!first) return null;

	if (first.length <= maxLength) return first;
	return `${first.slice(0, maxLength - 1).trimEnd()}…`;
}
