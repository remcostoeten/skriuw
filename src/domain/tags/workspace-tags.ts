import { extractNoteTags } from "@/domain/notes/note-links";
import type { NoteFile } from "@/domain/notes/models";
import type { JournalEntry, JournalTag } from "@/domain/journal/models";

const DEFAULT_TAG_COLOR = "hsl(var(--project-blue))";

type NoteTagSource = Pick<NoteFile, "tags" | "content">;

function normalizeTagName(tag: string): string {
	return tag.trim().replace(/^#/, "").toLowerCase();
}

function collectJournalEntryTagUsage(entries: JournalEntry[]): Map<string, number> {
	const usageCounts = new Map<string, number>();

	for (const entry of entries) {
		for (const tagName of entry.tags) {
			const normalized = normalizeTagName(tagName);
			if (!normalized) continue;
			usageCounts.set(normalized, (usageCounts.get(normalized) ?? 0) + 1);
		}
	}

	return usageCounts;
}

function collectNoteTagUsage(notes: NoteTagSource[]): Map<string, number> {
	const usageCounts = new Map<string, number>();

	for (const note of notes) {
		const noteTags = new Set<string>();

		for (const tag of note.tags ?? []) {
			const normalized = normalizeTagName(tag);
			if (normalized) noteTags.add(normalized);
		}

		for (const tag of extractNoteTags(note.content)) {
			noteTags.add(tag);
		}

		for (const tagName of noteTags) {
			usageCounts.set(tagName, (usageCounts.get(tagName) ?? 0) + 1);
		}
	}

	return usageCounts;
}

export function deriveWorkspaceTags(
	entries: JournalEntry[],
	persistedTags: JournalTag[],
	notes: NoteTagSource[],
): JournalTag[] {
	const usageCounts = collectJournalEntryTagUsage(entries);

	for (const [tagName, count] of collectNoteTagUsage(notes)) {
		usageCounts.set(tagName, (usageCounts.get(tagName) ?? 0) + count);
	}

	const tagsByName = new Map<string, JournalTag>(
		persistedTags.map((tag) => [
			tag.name,
			{ ...tag, usageCount: usageCounts.get(tag.name) ?? tag.usageCount ?? 0 },
		]),
	);

	for (const [tagName, usageCount] of usageCounts) {
		if (!tagsByName.has(tagName)) {
			tagsByName.set(tagName, {
				id: `derived-${tagName}`,
				name: tagName,
				color: DEFAULT_TAG_COLOR,
				usageCount,
			});
		}
	}

	return [...tagsByName.values()].toSorted((left, right) => {
		if (right.usageCount !== left.usageCount) {
			return right.usageCount - left.usageCount;
		}

		return left.name.localeCompare(right.name);
	});
}
