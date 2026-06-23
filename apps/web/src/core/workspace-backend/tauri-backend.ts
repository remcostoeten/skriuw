import type { UpdateNoteResult } from "@/domain/notes/actions";
import type { NoteFile, NoteFolder } from "@/domain/notes/models";
import { buildGraphFromNotes } from "@/domain/notes/graph-from-notes";
import { resolveRichDocument } from "@/domain/notes/rich-document";
import {
	buildNoteBacklinks,
	extractNoteLinks,
	getNoteTitle,
	normalizeNoteTitle,
} from "@/domain/notes/note-links";
import type { NoteLink, ResolvedNoteLink } from "@/domain/notes/note-links";
import {
	applyFolderUpdate,
	applyNoteUpdate,
	folderFromCreateInput,
	noteFromCreateInput,
} from "./note-builders";
import type { NoteSearchHit, WorkspaceBackend } from "./types";
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
		// The markdown vault is the source of truth and does not persist
		// `richContent`; when the index returns an empty rich document (e.g. a
		// note adopted from an external `.md` edit), derive blocks from the body.
		richContent: resolveRichDocument(raw.content, raw.richContent),
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

type RustNoteLink = {
	kind: NoteLink["kind"];
	raw: string;
	targetLabel: string;
	alias: string | null;
	targetNoteId: string | null;
	targetTitleKey: string | null;
};

type RustBacklinkSource = {
	note: RustNote;
	kind: NoteLink["kind"];
	raw: string;
	targetLabel: string;
	alias: string | null;
	matchedNoteId: boolean;
};

type RustBacklinkSources = {
	sources: RustBacklinkSource[];
	ambiguousTitleKeys: string[];
};

function noteTitleKeys(note: NoteFile): string[] {
	const keys = new Set<string>();
	for (const candidate of [normalizeNoteTitle(note.name), normalizeNoteTitle(getNoteTitle(note))]) {
		if (candidate) keys.add(candidate);
	}
	return [...keys];
}

function toRustNoteLink(link: NoteLink): RustNoteLink {
	return {
		kind: link.kind,
		raw: link.raw,
		targetLabel: link.targetLabel,
		alias: link.alias ?? null,
		targetNoteId: link.targetNoteId ?? null,
		targetTitleKey: link.targetNoteId ? null : normalizeNoteTitle(link.targetLabel),
	};
}

/**
 * The final resolution of a SQL-prefiltered backlink source into the exact
 * `ResolvedNoteLink` shape `buildNoteBacklinks` produces: always `resolved`,
 * pointing at the active note, carrying the source's link fields.
 */
function backlinkFromSource(source: RustBacklinkSource, activeId: string): ResolvedNoteLink {
	return {
		raw: source.raw,
		kind: source.kind,
		sourceNoteId: source.note.id,
		targetLabel: source.targetLabel,
		alias: source.alias ?? undefined,
		status: "resolved",
		targetNoteId: activeId,
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

	async function indexNoteLinks(note: NoteFile): Promise<void> {
		await invoke("replace_note_links", {
			noteId: note.id,
			links: extractNoteLinks(note).map(toRustNoteLink),
			titleKeys: noteTitleKeys(note),
		});
	}

	async function backfillNoteLinks(notes: NoteFile[]): Promise<void> {
		for (const note of notes) {
			await indexNoteLinks(note);
		}
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
			const rawActive = await invoke<RustNote | null>("get_note", { id });
			if (!rawActive) return [];
			const active = fromRustNote(rawActive);

			const indexed = await invoke<boolean>("has_indexed_links");
			if (!indexed) {
				const notes = await listNotes();
				await backfillNoteLinks(notes);
				return buildNoteBacklinks(active, notes);
			}

			const { sources } = await invoke<RustBacklinkSources>("get_backlink_sources", {
				targetId: id,
				titleKeys: noteTitleKeys(active),
			});
			const seen = new Set<string>();
			const backlinks: ResolvedNoteLink[] = [];
			for (const source of sources) {
				if (seen.has(source.note.id)) continue;
				seen.add(source.note.id);
				backlinks.push(backlinkFromSource(source, id));
			}
			return backlinks;
		},

		async getNoteGraph() {
			return buildGraphFromNotes(await listNotes());
		},

		async searchNotes(query, limit): Promise<NoteSearchHit[]> {
			if (!query.trim()) return [];
			return invoke<NoteSearchHit[]>("search_notes", { query, limit });
		},

		async restoreNoteVersion() {
			return { note: undefined, versionCreated: false };
		},

		async createNote(input) {
			const note = noteFromCreateInput(input);
			await invoke("upsert_note", { note: toRustNote(note) });
			await indexNoteLinks(note);
			return note;
		},

		async updateNote(input): Promise<UpdateNoteResult> {
			const raw = await invoke<RustNote | null>("get_note", { id: input.id });
			if (!raw) return { note: undefined, versionCreated: false };
			const next = applyNoteUpdate(fromRustNote(raw), input);
			await invoke("upsert_note", { note: toRustNote(next) });
			await indexNoteLinks(next);
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
