import { describe, expect, test } from "bun:test";
import { strToU8, zipSync } from "fflate";
import {
	importSimplenoteFile,
	previewSimplenoteFile,
} from "@/features/settings/lib/import-simplenote-vault";
import type { WorkspaceBackend } from "@/core/workspace-backend";
import type { NoteFile } from "@/domain/notes/models";

function simplenoteZip(): File {
	const notesJson = JSON.stringify({
		activeNotes: [
			{
				id: "11111111-1111-1111-1111-111111111111",
				content: "Active note\r\nbody #idea",
				creationDate: "2020-03-04T08:00:00.000Z",
				lastModified: "2021-06-07T09:00:00.000Z",
				tags: ["work"],
				markdown: false,
			},
		],
		trashedNotes: [
			{
				id: "22222222-2222-2222-2222-222222222222",
				content: "Trashed note",
				creationDate: "2019-01-01T00:00:00.000Z",
				lastModified: "2019-01-01T00:00:00.000Z",
			},
		],
	});
	const zipped = zipSync({ "source/notes.json": strToU8(notesJson) });
	return new File([zipped], "notes.zip", { type: "application/zip" });
}

type MockState = {
	imported: NoteFile[];
	deletedIds: string[];
};

function mockBackend(state: MockState): WorkspaceBackend {
	return {
		mode: "tauri",
		capabilities: { journal: true, sharing: false, collaboration: false, notifications: false, ai: true, trash: true, history: false },
		async listNotes() {
			return state.imported;
		},
		async importNotes(notes: NoteFile[]) {
			state.imported.push(...notes);
		},
		async deleteNote(id: string) {
			state.deletedIds.push(id);
		},
	} as unknown as WorkspaceBackend;
}

describe("importSimplenoteFile", () => {
	test("previews duplicate and unique Simplenote note counts", async () => {
		const state: MockState = {
			imported: [
				{
					id: "existing-note",
					name: "Active note.md",
					content: "Already here",
					richContent: [],
					preferredEditorMode: "raw",
					createdAt: new Date("2024-01-01T00:00:00.000Z"),
					modifiedAt: new Date("2024-01-01T00:00:00.000Z"),
					parentId: null,
					sortOrder: 0,
					tags: [],
				},
			],
			deletedIds: [],
		};

		const preview = await previewSimplenoteFile(simplenoteZip(), mockBackend(state));

		expect(preview).toMatchObject({
			total: 2,
			duplicates: 1,
			unique: 1,
		});
	});

	test("imports every note, preserves dates, and soft-deletes trashed ones into Trash", async () => {
		const state: MockState = { imported: [], deletedIds: [] };
		const summary = await importSimplenoteFile(simplenoteZip(), mockBackend(state));

		expect(summary).toMatchObject({
			imported: 2,
			trashed: 1,
			skipped: 0,
			overwritten: 0,
			duplicated: 0,
			total: 2,
		});
		expect(summary.importedNotes.map((note) => note.id)).toEqual([
			"11111111-1111-1111-1111-111111111111",
			"22222222-2222-2222-2222-222222222222",
		]);
		expect(state.imported).toHaveLength(2);

		const active = state.imported.find((note) => note.id === "11111111-1111-1111-1111-111111111111")!;
		expect(active.name).toBe("Active note.md");
		expect(active.parentId).toBeNull();
		expect(active.tags).toEqual(["work", "idea"]);
		expect(active.content).toBe("Active note\nbody #idea");
		expect(active.createdAt.toISOString()).toBe("2020-03-04T08:00:00.000Z");
		expect(active.modifiedAt.toISOString()).toBe("2021-06-07T09:00:00.000Z");

		// The trashed note is imported first (dates preserved), then soft-deleted.
		const trashed = state.imported.find((note) => note.id === "22222222-2222-2222-2222-222222222222")!;
		expect(trashed.createdAt.toISOString()).toBe("2019-01-01T00:00:00.000Z");
		expect(state.deletedIds).toEqual(["22222222-2222-2222-2222-222222222222"]);
	});

	test("skips Simplenote notes whose names already exist by default", async () => {
		const state: MockState = {
			imported: [
				{
					id: "existing-note",
					name: "Active note.md",
					content: "Already here",
					richContent: [],
					preferredEditorMode: "raw",
					createdAt: new Date("2024-01-01T00:00:00.000Z"),
					modifiedAt: new Date("2024-01-01T00:00:00.000Z"),
					parentId: null,
					sortOrder: 0,
					tags: [],
				},
			],
			deletedIds: [],
		};

		const summary = await importSimplenoteFile(simplenoteZip(), mockBackend(state));

		expect(summary).toMatchObject({ imported: 1, skipped: 1, duplicated: 0 });
		expect(state.imported.map((note) => note.name)).toEqual([
			"Active note.md",
			"Trashed note.md",
		]);
	});

	test("duplicates Simplenote notes with conflicting names when requested", async () => {
		const state: MockState = {
			imported: [
				{
					id: "existing-note",
					name: "Active note.md",
					content: "Already here",
					richContent: [],
					preferredEditorMode: "raw",
					createdAt: new Date("2024-01-01T00:00:00.000Z"),
					modifiedAt: new Date("2024-01-01T00:00:00.000Z"),
					parentId: null,
					sortOrder: 0,
					tags: [],
				},
			],
			deletedIds: [],
		};

		const summary = await importSimplenoteFile(simplenoteZip(), mockBackend(state), {
			duplicatePolicy: "duplicate",
		});

		expect(summary).toMatchObject({ imported: 2, skipped: 0, duplicated: 1 });
		expect(state.imported.map((note) => note.name)).toEqual([
			"Active note.md",
			"Active note (2).md",
			"Trashed note.md",
		]);
	});
});
