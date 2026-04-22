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

  test("tracks transient save state and resets workspace ui", () => {
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

    useNotesStore.getState().resetWorkspace();
    expect(useNotesStore.getState().activeFileId).toBe("");
    expect(useNotesStore.getState().isHydrated).toBe(false);
    expect(useNotesStore.getState().folderOpenState).toEqual({});
  });
});

describe("applyFolderUiState", () => {
  test("preserves explicit folder open state and defaults roots to open", () => {
    const folders: NoteFolder[] = [
      { id: "root", name: "Root", parentId: null, isOpen: false },
      { id: "child", name: "Child", parentId: "root", isOpen: false },
    ];

    const applied = applyFolderUiState(folders, { child: true });

    expect(applied).toEqual([
      { id: "root", name: "Root", parentId: null, isOpen: true },
      { id: "child", name: "Child", parentId: "root", isOpen: true },
    ]);
  });
});
