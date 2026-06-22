import { describe, expect, mock, test } from "bun:test";
import type { JournalEntry } from "@/types/journal";

mock.module("@/domain/journal/actions", () => ({
	createJournalEntry: async () => null,
	updateJournalEntry: async () => null,
	deleteJournalEntry: async () => undefined,
	createJournalTag: async () => null,
	deleteJournalTag: async () => undefined,
}));

// The journal hooks now resolve mutations through the WorkspaceBackend seam.
// Stub the barrel so importing the hook module doesn't pull `serverBackend`
// (and its `server-only` server-action chain) into the test runtime.
mock.module("@/core/workspace-backend", () => ({
	useWorkspaceBackend: () => ({}),
}));

const { isCurrentJournalDraftAcknowledgement, shouldAdoptJournalEntrySnapshot } =
	await import("@/features/journal/hooks/use-journal-entry");
const { mergeJournalEntriesByActiveDate, upsertJournalEntryByActiveDate } =
	await import("@/features/journal/hooks/use-journal-entries");

function entry(id: string, dateKey: string, content: string, updatedAt: string): JournalEntry {
	return {
		id,
		dateKey,
		content,
		tags: [],
		createdAt: new Date("2026-06-01T08:00:00.000Z"),
		updatedAt: new Date(updatedAt),
	};
}

describe("journal draft race guards", () => {
	test("keeps local content when a stale cache snapshot arrives for the active date", () => {
		const previous = {
			dateKey: "2026-06-10",
			entryId: "entry-1",
			content: "new local draft",
		};
		const staleSnapshot = {
			dateKey: "2026-06-10",
			entryId: "entry-1",
			content: "old server content",
		};

		expect(shouldAdoptJournalEntrySnapshot(previous, staleSnapshot, true)).toBe(false);
		expect(shouldAdoptJournalEntrySnapshot(previous, staleSnapshot, false)).toBe(true);
	});

	test("only acknowledges saves for the current date and latest draft revision", () => {
		expect(isCurrentJournalDraftAcknowledgement("2026-06-10", "2026-06-10", 3, 3)).toBe(true);
		expect(isCurrentJournalDraftAcknowledgement("2026-06-10", "2026-06-10", 2, 3)).toBe(false);
		expect(isCurrentJournalDraftAcknowledgement("2026-06-11", "2026-06-10", 3, 3)).toBe(false);
	});
});

describe("journal active date cache uniqueness", () => {
	test("keeps only the newest active entry for each date", () => {
		const older = entry("entry-a", "2026-06-10", "older", "2026-06-10T08:00:00.000Z");
		const newer = entry("entry-b", "2026-06-10", "newer", "2026-06-10T09:00:00.000Z");
		const otherDate = entry("entry-c", "2026-06-11", "tomorrow", "2026-06-11T08:00:00.000Z");

		expect(mergeJournalEntriesByActiveDate([older, otherDate, newer])).toEqual([
			newer,
			otherDate,
		]);
	});

	test("upserts by date instead of appending a duplicate", () => {
		const current = [
			entry("entry-a", "2026-06-10", "old", "2026-06-10T08:00:00.000Z"),
			entry("entry-b", "2026-06-11", "other", "2026-06-11T08:00:00.000Z"),
		];
		const next = entry("entry-c", "2026-06-10", "new", "2026-06-10T09:00:00.000Z");

		expect(upsertJournalEntryByActiveDate(current, next)).toEqual([current[1], next]);
	});
});
