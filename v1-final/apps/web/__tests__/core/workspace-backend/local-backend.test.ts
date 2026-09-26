import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { IDBFactory as FDBFactory } from "fake-indexeddb";
import {
	createLocalBackend,
	mergeSeedWithGuestFolders,
	mergeSeedWithGuestNotes,
	mergeSeedWithGuestWorkspace,
	resetGuestStorage,
	GUEST_SIGNUP_PROMPT_EVENT,
} from "@/core/workspace-backend/local-backend";
import { resetGuestWorkspaceStoreForTests } from "@/core/workspace-backend/local-store";
import { notesKeys } from "@/features/notes/hooks/notes-keys";
import type { NoteFile, NoteFolder } from "@/domain/notes/models";

// createLocalBackend only reads from the cache via getQueryData, so a minimal
// Map-backed stand-in avoids importing @tanstack/react-query (whose named
// exports don't resolve under bun's CJS interop in this repo).
function fakeQueryClient() {
	const store = new Map<string, unknown>();
	return {
		getQueryData: (key: readonly unknown[]) => store.get(JSON.stringify(key)),
		setQueryData: (key: readonly unknown[], value: unknown) =>
			void store.set(JSON.stringify(key), value),
	} as unknown as Parameters<typeof createLocalBackend>[0];
}

const STORAGE_KEY = "skriuw:guest:workspace:v2";
const ENGAGEMENT_KEY = "skriuw:guest:engagement:v1";

function createStorage() {
	const entries = new Map<string, string>();
	return {
		getItem: (key: string) => entries.get(key) ?? null,
		setItem: (key: string, value: string) => void entries.set(key, value),
		removeItem: (key: string) => void entries.delete(key),
		clear: () => entries.clear(),
	};
}

function installWindow(options: { indexedDB?: IDBFactory } = {}) {
	const localStorage = createStorage();
	const target = new EventTarget();
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: {
			localStorage,
			addEventListener: target.addEventListener.bind(target),
			removeEventListener: target.removeEventListener.bind(target),
			dispatchEvent: target.dispatchEvent.bind(target),
			indexedDB: options.indexedDB,
		},
	});
	return { localStorage };
}

function seedNote(overrides: Partial<NoteFile> = {}): NoteFile {
	return {
		id: "guest:welcome",
		name: "Welcome.md",
		content: "hello",
		richContent: [],
		preferredEditorMode: "block",
		createdAt: new Date("2024-01-01T00:00:00Z"),
		modifiedAt: new Date("2024-01-01T00:00:00Z"),
		parentId: null,
		sortOrder: 0,
		tags: [],
		...overrides,
	};
}

describe("local workspace backend", () => {
	beforeEach(() => {
		installWindow();
		resetGuestWorkspaceStoreForTests();
	});

	afterEach(() => {
		Reflect.deleteProperty(globalThis, "window");
	});

	test("createNote returns the note and persists it to storage", async () => {
		const backend = createLocalBackend(fakeQueryClient());
		const note = await backend.createNote({ name: "Idea", content: "draft" });

		expect(note.name).toBe("Idea.md");
		expect(note.content).toBe("draft");

		const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!);
		expect(stored.notes).toHaveLength(1);
		expect(stored.notes[0].id).toBe(note.id);
	});

	test("updating a seed-only note falls back to the cache and preserves seed fields", async () => {
		const queryClient = fakeQueryClient();
		const existing = seedNote();
		queryClient.setQueryData(notesKeys.detail(existing.id), existing);

		const backend = createLocalBackend(queryClient);
		const result = await backend.updateNote({ id: existing.id, content: "edited" });

		// Name/parent from the seed survive even though only content was edited.
		expect(result.note?.name).toBe("Welcome.md");
		expect(result.note?.content).toBe("edited");

		const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!);
		expect(stored.notes).toHaveLength(1);
		expect(stored.notes[0].name).toBe("Welcome.md");
	});

	test("updating an already-stored note mutates it in place", async () => {
		const backend = createLocalBackend(fakeQueryClient());
		const created = await backend.createNote({ name: "Note", content: "v1" });

		await backend.updateNote({ id: created.id, content: "v2" });

		const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!);
		expect(stored.notes).toHaveLength(1);
		expect(stored.notes[0].content).toBe("v2");
	});

	test("deleteFolder cascades to descendant folders and their notes", async () => {
		const backend = createLocalBackend(fakeQueryClient());
		const root = await backend.createFolder({ name: "root" });
		const child = await backend.createFolder({ name: "child", parentId: root.id });
		await backend.createNote({ name: "in-child", content: "", parentId: child.id });
		const survivor = await backend.createNote({
			name: "top-level",
			content: "",
			parentId: null,
		});

		await backend.deleteFolder(root.id);

		const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!);
		expect(stored.folders).toHaveLength(0);
		expect(stored.notes).toHaveLength(1);
		expect(stored.notes[0].id).toBe(survivor.id);
	});

	test("crossing an engagement threshold dispatches the sign-up prompt event", async () => {
		const backend = createLocalBackend(fakeQueryClient());
		let fired = 0;
		window.addEventListener(GUEST_SIGNUP_PROMPT_EVENT, () => {
			fired += 1;
		});

		// 10 is the first threshold.
		for (let i = 0; i < 10; i++) {
			await backend.createNote({ name: `n${i}`, content: "" });
		}

		expect(fired).toBe(1);
		expect(window.localStorage.getItem(ENGAGEMENT_KEY)).toBe("10");
	});

	test("resetGuestStorage clears workspace and engagement keys", async () => {
		const backend = createLocalBackend(fakeQueryClient());
		await backend.createNote({ name: "x", content: "" });

		await resetGuestStorage();

		expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
		expect(window.localStorage.getItem(ENGAGEMENT_KEY)).toBeNull();
	});

	test("merge helpers return seed data untouched when no guest edits exist", () => {
		const notes = [seedNote()];
		const folders: NoteFolder[] = [
			{ id: "guest:f1", name: "Folder", parentId: null, sortOrder: 0, isOpen: true },
		];

		expect(mergeSeedWithGuestNotes(notes)).toBe(notes);
		expect(mergeSeedWithGuestFolders(folders)).toBe(folders);
	});

	test("merge helpers overlay stored guest edits on top of seed data", async () => {
		const queryClient = fakeQueryClient();
		const seed = seedNote();
		queryClient.setQueryData(notesKeys.detail(seed.id), seed);

		const backend = createLocalBackend(queryClient);
		await backend.updateNote({ id: seed.id, content: "overlaid" });

		// Merge keeps the same id but takes the stored (edited) version.
		const merged = mergeSeedWithGuestNotes([seed]);
		expect(merged).toHaveLength(1);
		expect(merged[0]!.id).toBe(seed.id);
		expect(merged[0]!.content).toBe("overlaid");
	});

	test("uses IndexedDB when available without migrating localStorage workspace data", async () => {
		installWindow({ indexedDB: new FDBFactory() });
		const staleLocalStorageNote = seedNote({
			id: "guest:stale",
			content: "from localStorage",
		});
		window.localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({ notes: [staleLocalStorageNote], folders: [] }),
		);

		const backend = createLocalBackend(fakeQueryClient());
		const created = await backend.createNote({ name: "Indexed", content: "from idb" });

		const merged = await mergeSeedWithGuestWorkspace([], []);
		expect(merged.notes.map((note) => note.id)).toEqual([created.id]);
		expect(merged.notes.map((note) => note.content)).toEqual(["from idb"]);
	});
});
