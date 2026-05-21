import { createHash } from "node:crypto";
import type { NoteFile, NoteVersion, NoteVersionReason } from "./models";

export const NOTE_VERSION_MIN_INTERVAL_MS = 5 * 60 * 1000;
export const NOTE_VERSION_SIGNIFICANT_CHAR_DELTA = 160;
export const NOTE_VERSION_SIGNIFICANT_WORD_DELTA = 24;

type LatestVersion = Pick<NoteVersion, "contentHash" | "createdAt" | "name" | "content"> | null;

export type NoteVersionCandidate = Pick<
	NoteFile,
	"name" | "content" | "richContent" | "preferredEditorMode" | "parentId" | "tags"
> & {
	reason: NoteVersionReason;
};

export function normalizeVersionTags(tags: string[] | undefined): string[] {
	return [...new Set((tags ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean))].toSorted(
		(left, right) => left.localeCompare(right),
	);
}

export function buildNoteVersionContentHash(candidate: NoteVersionCandidate): string {
	const payload = JSON.stringify({
		name: candidate.name,
		content: candidate.content,
		richContent: candidate.richContent,
		preferredEditorMode: candidate.preferredEditorMode,
		parentId: candidate.parentId,
		tags: normalizeVersionTags(candidate.tags),
	});

	return createHash("sha256").update(payload).digest("hex");
}

function countWords(content: string): number {
	return content.split(/\s+/).filter(Boolean).length;
}

function countChars(content: string): number {
	return content.length;
}

export function shouldPersistNoteVersion(
	candidate: NoteVersionCandidate & { createdAt: Date },
	latestVersion: LatestVersion,
): boolean {
	if (!latestVersion) {
		return true;
	}

	const nextHash = buildNoteVersionContentHash(candidate);
	if (nextHash === latestVersion.contentHash) {
		return false;
	}

	if (candidate.reason !== "autosave") {
		return true;
	}

	const elapsed = candidate.createdAt.getTime() - latestVersion.createdAt.getTime();
	if (elapsed >= NOTE_VERSION_MIN_INTERVAL_MS) {
		return true;
	}

	const charDelta = Math.abs(countChars(candidate.content) - countChars(latestVersion.content));
	if (charDelta >= NOTE_VERSION_SIGNIFICANT_CHAR_DELTA) {
		return true;
	}

	const wordDelta = Math.abs(countWords(candidate.content) - countWords(latestVersion.content));
	return wordDelta >= NOTE_VERSION_SIGNIFICANT_WORD_DELTA;
}

export function summarizeNoteVersionReason(reason: NoteVersionReason): string {
	switch (reason) {
		case "created":
			return "Initial version";
		case "rename":
			return "Metadata update";
		case "restore":
			return "Restored checkpoint";
		case "autosave":
		default:
			return "Autosaved checkpoint";
	}
}

export function formatNoteVersionDelta(currentContent: string, previousContent?: string): string {
	if (!previousContent) {
		return "+0 -0";
	}

	const currentWords = countWords(currentContent);
	const previousWords = countWords(previousContent);
	const currentChars = countChars(currentContent);
	const previousChars = countChars(previousContent);
	const wordDelta = currentWords - previousWords;
	const charDelta = currentChars - previousChars;

	const wordLabel = wordDelta >= 0 ? `+${wordDelta}` : `${wordDelta}`;
	const charLabel = charDelta >= 0 ? `+${charDelta}` : `${charDelta}`;

	return `${wordLabel} ${charLabel}`;
}

export function previewVersionContent(content: string): string[] {
	return content
		.split("\n")
		.map((line) => line.trimEnd())
		.filter((line) => line.trim().length > 0)
		.slice(0, 3);
}
