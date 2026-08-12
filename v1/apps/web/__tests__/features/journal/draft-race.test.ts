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
const noopBackend = {
	mode: "local",
	capabilities: {
		journal: false,
		sharing: false,
		collaboration: false,
		notifications: false,
		ai: false,
	},
	createNote: async () => ({}),
	updateNote: async () => ({ versionCreated: false }),
	deleteNote: async () => {},
	restoreNoteVersion: async () => ({ versionCreated: false }),
	getNote: async () => null,
	getNotes: async () => [],
	getNoteVersions: async () => [],
	getNoteBacklinks: async () => [],
	getNoteGraph: async () => ({ nodes: [], links: [] }),
	createFolder: async () => ({}),
	updateFolder: async () => undefined,
	deleteFolder: async () => {},
	createJournalEntry: async () => ({}),
	updateJournalEntry: async () => undefined,
	deleteJournalEntry: async () => {},
	createJournalTag: async () => ({}),
	deleteJournalTag: async () => {},
};

mock.module("@/core/workspace-backend", () => ({
	useWorkspaceBackend: () => noopBackend,
	useIsGuestWorkspace: () => false,
	useWorkspaceCapabilities: () => ({}),
	isTauriRuntime: () => false,
	createTauriBackend: () => ({}),
	tauriInvoke: async () => undefined,
	tauriChannel: () => ({}),
	WorkspaceBackendProvider: ({ children }: { children?: unknown }) => children,
	WorkspaceCapabilityError: class WorkspaceCapabilityError extends Error {},
	serverBackend: {},
	createLocalBackend: () => ({}),
	mergeSeedWithGuestNotes: (notes: unknown) => notes,
	mergeSeedWithGuestFolders: (folders: unknown) => folders,
	mergeSeedWithGuestWorkspace: async (notes: unknown, folders: unknown) => ({ notes, folders }),
	resetGuestStorage: () => undefined,
	GUEST_SIGNUP_PROMPT_EVENT: "guest-signup-prompt",
	recordGuestGraphExplore: () => undefined,
}));

const { isCurrentJournalDraftAcknowledgement } =
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
