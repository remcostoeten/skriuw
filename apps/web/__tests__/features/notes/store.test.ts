import { describe, expect, test } from "bun:test";
import { applyFolderUiState, useNotesStore } from "@/features/notes/store";
import type { NoteFolder } from "@/types/notes";

describe("notes ui store", () => {
	test("ensures the active file id stays valid for the current file list", () => {
		useNotesStore.setState({
			activeFileId: "missing",
			isHydrated: false,
			folderOpenState: {},
			saveStates: {},
		});

		useNotesStore.getState().ensureActiveFileId([
			{
				id: "note-a",
				name: "Alpha.md",
				content: "# Alpha",
				richContent: [],
				preferredEditorMode: "block",
				createdAt: new Date("2026-04-15T10:00:00.000Z"),
				modifiedAt: new Date("2026-04-15T10:00:00.000Z"),
				parentId: null,
			},
		]);

		expect(useNotesStore.getState().activeFileId).toBe("note-a");

		useNotesStore.getState().ensureActiveFileId([]);

		expect(useNotesStore.getState().activeFileId).toBe("");
	});

	test("tracks split editor state", () => {
		useNotesStore.setState({
			activeFileId: "note-a",
			split: {
				secondaryFileId: null,
				focusedPane: "primary",
				scrollPositions: {},
				orientation: "vertical",
				secondaryFirst: false,
			},
		});

		useNotesStore.getState().openSplitBeside("note-b", "note-a");
		expect(useNotesStore.getState().split.secondaryFileId).toBe("note-b");
		expect(useNotesStore.getState().split.focusedPane).toBe("secondary");

		useNotesStore.getState().setSecondaryFile("note-c");
		expect(useNotesStore.getState().split.secondaryFileId).toBe("note-c");

		useNotesStore.getState().setEditorScrollPosition("note-a", 120);
		expect(useNotesStore.getState().split.scrollPositions["note-a"]).toBe(120);

		useNotesStore.getState().toggleSplitOrientation();
		expect(useNotesStore.getState().split.orientation).toBe("horizontal");

		useNotesStore.getState().swapSplitPaneOrder();
		expect(useNotesStore.getState().split.secondaryFirst).toBe(true);

		useNotesStore.getState().closeSplit();
		expect(useNotesStore.getState().split.secondaryFileId).toBeNull();
		expect(useNotesStore.getState().split.focusedPane).toBe("primary");
		expect(useNotesStore.getState().split.secondaryFirst).toBe(false);
	});

	test("tracks transient save state and resets ui", () => {
		useNotesStore.setState({
			activeFileId: "note-a",
			isHydrated: true,
			folderOpenState: { "folder-a": true },
			saveStates: {},
		});

		useNotesStore.getState().setFileSaveState("note-a", "saving");
		expect(useNotesStore.getState().getFileSaveState("note-a")).toBe("saving");

		useNotesStore.getState().clearFileSaveState("note-a");
		expect(useNotesStore.getState().getFileSaveState("note-a")).toBe("idle");

		useNotesStore.getState().resetUi();
		expect(useNotesStore.getState().activeFileId).toBe("");
		expect(useNotesStore.getState().isHydrated).toBe(false);
		expect(useNotesStore.getState().folderOpenState).toEqual({});
	});
});

describe("applyFolderUiState", () => {
	test("defaults all folders to open unless explicitly closed", () => {
		const folders: NoteFolder[] = [
			{ id: "root", name: "Root", parentId: null, isOpen: false },
			{ id: "child", name: "Child", parentId: "root", isOpen: false },
		];

		expect(applyFolderUiState(folders, {})).toEqual([
			{ id: "root", name: "Root", parentId: null, isOpen: true },
			{ id: "child", name: "Child", parentId: "root", isOpen: true },
		]);

		expect(applyFolderUiState(folders, { child: false })).toEqual([
			{ id: "root", name: "Root", parentId: null, isOpen: true },
			{ id: "child", name: "Child", parentId: "root", isOpen: false },
		]);
	});
});
