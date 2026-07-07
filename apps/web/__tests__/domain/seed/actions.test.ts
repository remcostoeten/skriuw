import { afterEach, describe, expect, mock, test } from "bun:test";

let loadGuestSeedNoteCalls: string[] = [];
let loadGuestWorkspaceSnapshotCalls = 0;

function registerMocks() {
	mock.module("@/domain/seed/guest-bundle", () => ({
		loadGuestSeedNote: async (id: string) => {
			loadGuestSeedNoteCalls.push(id);
			return id === "guest:note-1"
				? {
						id,
						name: "Seed note",
						content: "body",
						richContent: [],
						preferredEditorMode: "block",
						createdAt: new Date("2024-01-01T00:00:00Z"),
						modifiedAt: new Date("2024-01-01T00:00:00Z"),
						parentId: null,
						sortOrder: 0,
						tags: [],
					}
				: null;
		},
		loadGuestWorkspaceSnapshot: async () => {
			loadGuestWorkspaceSnapshotCalls += 1;
			return {
				notes: [],
				noteDetails: [
					{
						id: "guest:note-1",
						name: "Seed note",
						content: "body",
						richContent: [],
						preferredEditorMode: "block",
						createdAt: new Date("2024-01-01T00:00:00Z"),
						modifiedAt: new Date("2024-01-01T00:00:00Z"),
						parentId: null,
						sortOrder: 0,
						tags: [],
					},
					{
						id: "guest:note-2",
						name: "Other seed note",
						content: "other",
						richContent: [],
						preferredEditorMode: "block",
						createdAt: new Date("2024-01-01T00:00:00Z"),
						modifiedAt: new Date("2024-01-01T00:00:00Z"),
						parentId: null,
						sortOrder: 1,
						tags: [],
					},
				],
				folders: [],
			};
		},
	}));
}

afterEach(() => {
	mock.restore();
	loadGuestSeedNoteCalls = [];
	loadGuestWorkspaceSnapshotCalls = 0;
});

describe("seed actions", () => {
	test("ignores non-guest ids", async () => {
		registerMocks();
		const { fetchGuestSeedNote } = await import(
			`@/domain/seed/actions?test=${Math.random().toString(36).slice(2)}`
		);

		await expect(fetchGuestSeedNote("note-1")).resolves.toBeNull();
		await expect(fetchGuestSeedNote("guest:note-1")).resolves.toMatchObject({
			id: "guest:note-1",
		});
		expect(loadGuestSeedNoteCalls).toEqual(["guest:note-1"]);
	});

	test("filters and dedupes guest seed note lookups", async () => {
		registerMocks();
		const { fetchGuestSeedNotes } = await import(
			`@/domain/seed/actions?test=${Math.random().toString(36).slice(2)}`
		);

		await expect(
			fetchGuestSeedNotes(["", "note-1", "guest:note-2", "guest:note-1", "guest:note-2"]),
		).resolves.toEqual([
			expect.objectContaining({ id: "guest:note-1" }),
			expect.objectContaining({ id: "guest:note-2" }),
		]);
		expect(loadGuestWorkspaceSnapshotCalls).toBe(1);
	});

	test("skips the workspace snapshot when every id is invalid", async () => {
		registerMocks();
		const { fetchGuestSeedNotes } = await import(
			`@/domain/seed/actions?test=${Math.random().toString(36).slice(2)}`
		);

		await expect(fetchGuestSeedNotes(["", "note-1", "auth:note-2"])).resolves.toEqual([]);
		expect(loadGuestWorkspaceSnapshotCalls).toBe(0);
	});
});
