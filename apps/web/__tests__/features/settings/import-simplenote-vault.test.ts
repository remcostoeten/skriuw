import { describe, expect, test } from "bun:test";
import { strToU8, zipSync } from "fflate";
import {
	importSimplenoteFile,
	organizeWorkspaceNotesByYear,
	previewSimplenoteFile,
} from "@/features/settings/lib/import-simplenote-vault";
import type { WorkspaceBackend } from "@/core/workspace-backend";
import type { CreateFolderInput } from "@/domain/folders/actions";
import type { UpdateNoteInput } from "@/domain/notes/actions";
import type { NoteFile, NoteFolder } from "@/domain/notes/models";

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
	folders: NoteFolder[];
	deletedIds: string[];
};

function mockBackend(state: MockState): WorkspaceBackend {
	return {
		mode: "tauri",
		capabilities: {
			journal: true,
			sharing: false,
			collaboration: false,
			notifications: false,
			ai: true,
			trash: true,
			history: false,
		},
		async listNotes() {
			return state.imported;
		},
		async listFolders() {
			return state.folders;
		},
		async createFolder(input: CreateFolderInput) {
			const folder = {
				id: input.id ?? crypto.randomUUID(),
				name: input.name,
				parentId: input.parentId ?? null,
				sortOrder: input.sortOrder ?? 0,
				isOpen: true,
			};
			state.folders.push(folder);
			return folder;
		},
		async importNotes(notes: NoteFile[]) {
			state.imported.push(...notes);
		},
		async updateNote(input: UpdateNoteInput) {
			const index = state.imported.findIndex((note) => note.id === input.id);
			if (index === -1) return { note: undefined, versionCreated: false };
			const next = {
				...state.imported[index],
				...input,
				parentId: input.parentId ?? state.imported[index].parentId,
				modifiedAt: new Date(),
			} as NoteFile;
			state.imported[index] = next;
			return { note: next, versionCreated: false };
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
			folders: [],
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
		const state: MockState = { imported: [], folders: [], deletedIds: [] };
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

		const active = state.imported.find(
			(note) => note.id === "11111111-1111-1111-1111-111111111111",
		)!;
		expect(active.name).toBe("Active note.md");
		expect(active.parentId).toBeNull();
		expect(active.tags).toEqual(["work"]);
		expect(active.content).toBe("Active note\nbody #idea");
		expect(active.createdAt.toISOString()).toBe("2020-03-04T08:00:00.000Z");
		expect(active.modifiedAt.toISOString()).toBe("2021-06-07T09:00:00.000Z");

		// The trashed note is imported first (dates preserved), then soft-deleted.
		const trashed = state.imported.find(
			(note) => note.id === "22222222-2222-2222-2222-222222222222",
		)!;
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
			folders: [],
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
			folders: [],
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

	test("organizes imported Simplenote notes into creation-year folders when requested", async () => {
		const state: MockState = { imported: [], folders: [], deletedIds: [] };

		const summary = await importSimplenoteFile(simplenoteZip(), mockBackend(state), {
			organizationMode: "year",
		});

		expect(summary.organizedByYear).toBe(2);
		expect(state.folders.map((folder) => folder.name)).toEqual(["2020", "2019"]);
		const folderByName = new Map(state.folders.map((folder) => [folder.name, folder.id]));
		expect(
			state.imported.find((note) => note.id === "11111111-1111-1111-1111-111111111111")
				?.parentId,
		).toBe(folderByName.get("2020"));
		expect(
			state.imported.find((note) => note.id === "22222222-2222-2222-2222-222222222222")
				?.parentId,
		).toBe(folderByName.get("2019"));
	});

	test("organizes existing root notes into creation-year folders", async () => {
		const state: MockState = {
			imported: [
				{
					id: "a",
					name: "A.md",
					content: "A",
					richContent: [],
					preferredEditorMode: "raw",
					createdAt: new Date("2024-05-01T00:00:00.000Z"),
					modifiedAt: new Date("2024-05-01T00:00:00.000Z"),
					parentId: null,
					sortOrder: 0,
					tags: [],
				},
				{
					id: "b",
					name: "B.md",
					content: "B",
					richContent: [],
					preferredEditorMode: "raw",
					createdAt: new Date("2023-05-01T00:00:00.000Z"),
					modifiedAt: new Date("2023-05-01T00:00:00.000Z"),
					parentId: null,
					sortOrder: 1,
					tags: [],
				},
			],
			folders: [],
			deletedIds: [],
		};

		const result = await organizeWorkspaceNotesByYear(mockBackend(state));

		expect(result).toEqual({ moved: 2, folders: 2 });
		expect(state.folders.map((folder) => folder.name)).toEqual(["2024", "2023"]);
		expect(state.imported.every((note) => note.parentId !== null)).toBe(true);
	});
});
