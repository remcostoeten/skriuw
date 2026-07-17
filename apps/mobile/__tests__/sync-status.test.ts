import { describe, expect, test } from "bun:test";
import { fetchCloudSyncStatus } from "@/query/sync-status";

describe("fetchCloudSyncStatus", () => {
	test("counts the complete cloud workspace returned by the backend", async () => {
		const status = await fetchCloudSyncStatus({
			async listNotes() {
				return [{}, {}, {}] as never[];
			},
			async listFolders() {
				return [{}, {}] as never[];
			},
			async listJournalEntries() {
				return [{}, {}, {}, {}] as never[];
			},
		});

		expect(status).toEqual({
			noteCount: 3,
			folderCount: 2,
			journalEntryCount: 4,
		});
	});
});
