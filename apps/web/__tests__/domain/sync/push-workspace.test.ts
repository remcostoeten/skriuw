import { afterEach, describe, expect, test } from "bun:test";
import { pushWorkspaceToServer } from "@/domain/sync/push-workspace";
import type { WorkspaceBackend } from "@/core/workspace-backend";
import type { NoteFile } from "@/domain/notes/models";

const originalFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = originalFetch;
});

function note(): NoteFile {
	return {
		id: "11111111-1111-4111-8111-111111111111",
		name: "Local.md",
		content: "# Local",
		richContent: [],
		preferredEditorMode: "raw",
		createdAt: new Date("2026-07-01T10:00:00Z"),
		modifiedAt: new Date("2026-07-15T10:00:00Z"),
		parentId: null,
		tags: ["local"],
	};
}

function backend(): WorkspaceBackend {
	const local = note();
	return {
		listNotes: async () => [{ ...local, content: "", richContent: [] }],
		getNotes: async () => [local],
		listFolders: async () => [],
		listJournalEntries: async () => [],
	} as unknown as WorkspaceBackend;
}

describe("pushWorkspaceToServer", () => {
	test("requires the writable bearer token and sends deletions only from the prior baseline", async () => {
		let request: RequestInit | undefined;
		globalThis.fetch = (async (_url, init) => {
			request = init;
			return Response.json({
				created: 1,
				updated: 0,
				deleted: 1,
				conflicts: 0,
				syncedAt: "2026-07-15T12:00:00.000Z",
			});
		}) as typeof fetch;

		const result = await pushWorkspaceToServer(backend(), {
			serverUrl: "https://example.com/",
			token: "sk_sync_secret",
			enabled: true,
			lastSyncedAt: "2026-07-14T12:00:00.000Z",
			lastSnapshotIds: {
				notes: ["11111111-1111-4111-8111-111111111111", "deleted-note"],
				folders: [],
				journalEntries: [],
			},
		});

		expect((request?.headers ?? {}) as Record<string, string>).toHaveProperty(
			"Authorization",
			"Bearer sk_sync_secret",
		);
		const payload = JSON.parse(request?.body as string) as {
			deletedIds: { notes: string[] };
			notes: Array<{ content: string }>;
		};
		expect(payload.deletedIds.notes).toEqual(["deleted-note"]);
		expect(payload.notes[0]?.content).toBe("# Local");
		expect(result.snapshotIds.notes).toEqual(["11111111-1111-4111-8111-111111111111"]);
	});

	test("keeps network failures retryable", async () => {
		globalThis.fetch = (async () => {
			throw new Error("offline");
		}) as unknown as typeof fetch;
		await expect(
			pushWorkspaceToServer(backend(), {
				serverUrl: "https://example.com",
				token: "token",
				enabled: true,
			}),
		).rejects.toThrow("Local changes remain safely queued");
	});
});
