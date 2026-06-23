import type { UpdateNoteResult } from "@/domain/notes/actions";
import type { NoteFile, NoteFolder } from "@/domain/notes/models";
import { buildGraphFromNotes } from "@/domain/notes/graph-from-notes";
import { buildNoteBacklinks } from "@/domain/notes/note-links";
import {
	applyFolderUpdate,
	applyNoteUpdate,
	folderFromCreateInput,
	noteFromCreateInput,
} from "./note-builders";
import type { WorkspaceBackend } from "./types";
import { WorkspaceCapabilityError } from "./capability-error";

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

type TauriGlobal = {
	__TAURI__?: { core?: { invoke?: TauriInvoke } };
};

/** The Rust `Note` wire shape — timestamps as epoch-millis, JSON `richContent`. */
type RustNote = {
	id: string;
	name: string;
	content: string;
	richContent: NoteFile["richContent"];
	preferredEditorMode: NoteFile["preferredEditorMode"];
	parentId: string | null;
	sortOrder: number;
	tags: string[];
	createdAt: number;
	modifiedAt: number;
};

type RustFolder = {
	id: string;
	name: string;
	parentId: string | null;
	sortOrder: number;
	isOpen: boolean;
};

/** True when running inside the Tauri webview (vs. a browser tab). */
export function isTauriRuntime(): boolean {
	if (typeof window === "undefined") return false;
	return Boolean((window as TauriGlobal).__TAURI__?.core?.invoke);
}

function getInvoke(): TauriInvoke {
	const invoke = (globalThis as TauriGlobal).__TAURI__?.core?.invoke;
	if (!invoke) {
		throw new Error("Tauri IPC is unavailable — tauriBackend used outside the desktop shell");
	}
	return invoke;
}

function toRustNote(note: NoteFile): RustNote {
	return {
		id: note.id,
		name: note.name,
		content: note.content,
		richContent: note.richContent,
		preferredEditorMode: note.preferredEditorMode,
		parentId: note.parentId ?? null,
		sortOrder: note.sortOrder ?? 0,
		tags: note.tags ?? [],
		createdAt: note.createdAt.getTime(),
		modifiedAt: note.modifiedAt.getTime(),
	};
}

function fromRustNote(raw: RustNote): NoteFile {
	return {
		id: raw.id,
		name: raw.name,
		content: raw.content,
		richContent: raw.richContent,
		preferredEditorMode: raw.preferredEditorMode,
		parentId: raw.parentId,
		sortOrder: raw.sortOrder,
		tags: raw.tags,
		createdAt: new Date(raw.createdAt),
		modifiedAt: new Date(raw.modifiedAt),
	};
}

function toRustFolder(folder: NoteFolder): RustFolder {
	return {
		id: folder.id,
		name: folder.name,
		parentId: folder.parentId ?? null,
		sortOrder: folder.sortOrder ?? 0,
		isOpen: folder.isOpen,
	};
}

function fromRustFolder(raw: RustFolder): NoteFolder {
	return {
		id: raw.id,
		name: raw.name,
		parentId: raw.parentId,
		sortOrder: raw.sortOrder,
		isOpen: raw.isOpen,
	};
}

/**
 * Desktop backend: every read and mutation crosses the Tauri IPC boundary to a
 * local Rust + SQLite store. Record building (ids, defaults, timestamps) and
 * the derived graph/backlink views reuse the same pure helpers as the guest
 * `localBackend`, so a note edited on desktop is byte-identical to one edited
 * as a guest. Cloud-only features are capability-gated off, like guest mode.
 */
export function createTauriBackend(): WorkspaceBackend {
	const invoke = getInvoke();

	async function listNotes(): Promise<NoteFile[]> {
		const rows = await invoke<RustNote[]>("list_notes");
		return rows.map(fromRustNote);
	}

	async function listFolders(): Promise<NoteFolder[]> {
		const rows = await invoke<RustFolder[]>("list_folders");
		return rows.map(fromRustFolder);
	}

	return {
		mode: "tauri",
		capabilities: {
			journal: false,
			sharing: false,
			collaboration: false,
			notifications: false,
			ai: false,
		},

		async getNote(id) {
			const raw = await invoke<RustNote | null>("get_note", { id });
			return raw ? fromRustNote(raw) : null;
		},

		async getNotes(ids) {
			const rows = await invoke<RustNote[]>("get_notes", { ids });
			return rows.map(fromRustNote);
		},

		async getNoteVersions() {
			return [];
		},

		async getNoteBacklinks(id) {
			const notes = await listNotes();
			const active = notes.find((note) => note.id === id) ?? null;
			return buildNoteBacklinks(active, notes);
		},

		async getNoteGraph() {
			return buildGraphFromNotes(await listNotes());
		},

		async restoreNoteVersion() {
			return { note: undefined, versionCreated: false };
		},

		async createNote(input) {
			const note = noteFromCreateInput(input);
			await invoke("upsert_note", { note: toRustNote(note) });
			return note;
		},

		async updateNote(input): Promise<UpdateNoteResult> {
			const raw = await invoke<RustNote | null>("get_note", { id: input.id });
			if (!raw) return { note: undefined, versionCreated: false };
			const next = applyNoteUpdate(fromRustNote(raw), input);
			await invoke("upsert_note", { note: toRustNote(next) });
			return { note: next, versionCreated: false };
		},

		async deleteNote(id) {
			await invoke("delete_note", { id });
		},

		async createFolder(input) {
			const folder = folderFromCreateInput(input);
			await invoke("upsert_folder", { folder: toRustFolder(folder) });
			return folder;
		},

		async updateFolder(input) {
			const folders = await listFolders();
			const existing = folders.find((folder) => folder.id === input.id);
			if (!existing) return undefined;
			const next = applyFolderUpdate(existing, input);
			await invoke("upsert_folder", { folder: toRustFolder(next) });
			return next;
		},

		async deleteFolder(id) {
			await invoke("delete_folder", { id });
		},

		async createJournalEntry() {
			throw new WorkspaceCapabilityError("journal");
		},
		async updateJournalEntry() {
			throw new WorkspaceCapabilityError("journal");
		},
		async deleteJournalEntry() {
			throw new WorkspaceCapabilityError("journal");
		},
		async createJournalTag() {
			throw new WorkspaceCapabilityError("journal");
		},
		async deleteJournalTag() {
			throw new WorkspaceCapabilityError("journal");
		},
	};
}
