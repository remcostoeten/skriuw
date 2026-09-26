import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
	makeNote,
	createInitialStoreState,
	installNotesLayoutMocks,
	renderNotesLayout,
	type NotesStoreState,
} from "../../../fixtures/use-notes-layout-mocks";
import type { NoteFile } from "@/types/notes";

type MockFn = (...args: any[]) => any;
const createMock = mock as unknown as (implementation: MockFn) => MockFn & {
	mock: { calls: unknown[][] };
};

let notes: NoteFile[];
let notesStoreState: NotesStoreState;
let flush: ReturnType<typeof createMock>;
let flushAll: ReturnType<typeof createMock>;

beforeEach(() => {
	notes = [makeNote("note-a"), makeNote("note-b"), makeNote("note-c")];
	notesStoreState = createInitialStoreState();
	flush = createMock(() => new Promise<void>(() => undefined));
	flushAll = createMock(() => new Promise<void>(() => undefined));
});

afterEach(() => {
	mock.restore();
});

async function renderLayout() {
	await installNotesLayoutMocks(notes, notesStoreState, flush, flushAll);
	return renderNotesLayout();
}

describe("useNotesLayout note switching saves", () => {
	test("creates new notes in block mode even when raw mode is the preference", async () => {
		const mutate = createMock(() => undefined);
		await installNotesLayoutMocks(notes, notesStoreState, flush, flushAll, {
			defaultModeRaw: true,
			createNoteMutation: { mutate, isPending: false },
		});
		const layout = await renderNotesLayout();

		layout.createFile();

		expect(mutate.mock.calls[0]?.[0]).toMatchObject({ preferredEditorMode: "block" });
	});

	test("selects another note immediately while the previous note flush is pending", async () => {
		const layout = await renderLayout();

		layout.handleFileSelect("note-b");

		expect(notesStoreState.activeFileId).toBe("note-b");
		expect(flush).toHaveBeenCalledWith("note-a", { createCheckpoint: true });
	});

	test("next navigation updates the active note immediately while flushing the previous note", async () => {
		const layout = await renderLayout();

		layout.handleNavigateNext();

		expect(notesStoreState.activeFileId).toBe("note-b");
		expect(flush).toHaveBeenCalledWith("note-a", { createCheckpoint: true });
	});

	test("switches the focused split pane immediately while that pane flush is pending", async () => {
		notesStoreState.split = {
			...notesStoreState.split,
			secondaryFileId: "note-b",
			focusedPane: "secondary",
		};
		const layout = await renderLayout();

		layout.handleFileSelect("note-c");

		expect(notesStoreState.split.secondaryFileId).toBe("note-c");
		expect(notesStoreState.activeFileId).toBe("note-a");
		expect(flush).toHaveBeenCalledWith("note-b", { createCheckpoint: true });
	});

	test("opens a split pane immediately while flushing pending edits in the background", async () => {
		const layout = await renderLayout();

		layout.handleOpenBeside("note-b");

		expect(notesStoreState.split.secondaryFileId).toBe("note-b");
		expect(notesStoreState.split.focusedPane).toBe("secondary");
		expect(flushAll).toHaveBeenCalledWith({ createCheckpoint: true });
	});
});
