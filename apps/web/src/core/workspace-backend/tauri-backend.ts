import type { UpdateNoteResult } from "@/domain/notes/actions";
import type { NoteFile, NoteFolder } from "@/domain/notes/models";
import { normalizeNoteProperties } from "@/domain/notes/properties";
import type { JournalEntry, JournalTag, MoodLevel } from "@/domain/journal/models";
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
import type { NoteSearchHit, TrashBatch, WorkspaceBackend } from "./types";

/** The Rust `TrashRecord` wire shape — one soft-deleted note or folder. */
type RustTrashRecord = {
	batchId: string;
	kind: "note" | "folder";
	id: string;
	name: string;
	parentId: string | null;
	sortOrder: number;
	deletedAt: number;
};

function trashRecordsToBatches(records: RustTrashRecord[]): TrashBatch[] {
	const groups = new Map<string, RustTrashRecord[]>();
	for (const record of records) {
		const group = groups.get(record.batchId) ?? [];
		group.push(record);
		groups.set(record.batchId, group);
	}

	const batches: TrashBatch[] = [];
	for (const [batchId, group] of groups) {
		const folderRecords = group.filter((record) => record.kind === "folder");
		const isFolder = folderRecords.length > 0;
		const rootFolderId = batchId.startsWith("folder:") ? batchId.slice("folder:".length) : null;
		const primary =
			(isFolder
				? folderRecords.find((record) => record.id === rootFolderId)
				: group[0]) ?? group[0];
		batches.push({
			id: batchId,
			deletedAt: new Date(Math.max(...group.map((record) => record.deletedAt))),
			kind: isFolder ? "folder" : "note",
			primary: { id: primary.id, name: primary.name },
			noteCount: group.filter((record) => record.kind === "note").length,
			folderCount: folderRecords.length,
		});
	}

	return batches.sort((left, right) => right.deletedAt.getTime() - left.deletedAt.getTime());
}

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

/** Mirror of Tauri's `Channel` for streaming command events (install/pull progress). */
export type TauriChannel<T> = {
	onmessage: (message: T) => void;
};

type TauriChannelCtor = new <T>() => TauriChannel<T>;

type TauriGlobal = {
	__TAURI__?: { core?: { invoke?: TauriInvoke; Channel?: TauriChannelCtor } };
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
	properties: NoteFile["properties"];
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

/** Invoke a Tauri command from anywhere (settings, etc.). Desktop-only. */
export function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
	return getInvoke()<T>(command, args);
}

/**
 * Build a Tauri IPC channel for commands that stream events (Ollama install and
 * model-pull progress). Pass the returned object as a command arg; `onMessage`
 * fires for every event the Rust side sends. Desktop-only.
 */
export function tauriChannel<T>(onMessage: (message: T) => void): TauriChannel<T> {
	const Channel = (globalThis as TauriGlobal).__TAURI__?.core?.Channel;
	if (!Channel) {
		throw new Error("Tauri Channel is unavailable — used outside the desktop shell");
	}
	const channel = new Channel<T>();
	channel.onmessage = onMessage;
	return channel;
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
		properties: normalizeNoteProperties(note.properties),
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
		properties: normalizeNoteProperties(raw.properties),
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

/** The Rust `JournalEntry` wire shape — timestamps as epoch-millis, `mood` null when absent. */
type RustJournalEntry = {
	id: string;
	dateKey: string;
	title: string | null;
	content: string;
	tags: string[];
	mood: string | null;
	createdAt: number;
	updatedAt: number;
};

type RustJournalTag = {
	id: string;
	name: string;
	color: string;
	usageCount: number;
};

function toRustJournalEntry(entry: JournalEntry): RustJournalEntry {
	return {
		id: entry.id,
		dateKey: entry.dateKey,
		title: entry.title ?? null,
		content: entry.content,
		tags: entry.tags,
		mood: entry.mood ?? null,
		createdAt: entry.createdAt.getTime(),
		updatedAt: entry.updatedAt.getTime(),
	};
}

function fromRustJournalEntry(raw: RustJournalEntry): JournalEntry {
	return {
		id: raw.id,
		dateKey: raw.dateKey,
		title: raw.title ?? undefined,
		content: raw.content,
		tags: raw.tags,
		mood: (raw.mood ?? undefined) as MoodLevel | undefined,
		createdAt: new Date(raw.createdAt),
		updatedAt: new Date(raw.updatedAt),
	};
}

function fromRustJournalTag(raw: RustJournalTag): JournalTag {
	return {
		id: raw.id,
		name: raw.name,
		color: raw.color,
		usageCount: raw.usageCount,
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

	async function listJournalEntries(): Promise<JournalEntry[]> {
		const rows = await invoke<RustJournalEntry[]>("list_journal_entries");
		return rows.map(fromRustJournalEntry);
	}

	async function listJournalTags(): Promise<JournalTag[]> {
		const rows = await invoke<RustJournalTag[]>("list_journal_tags");
		return rows.map(fromRustJournalTag);
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
			journal: true,
			sharing: false,
			collaboration: false,
			notifications: false,
			ai: true,
			trash: true,
			history: false,
		},

		listNotes,
		listFolders,

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

		async importNotes(notes) {
			await invoke("bulk_upsert_notes", { notes: notes.map(toRustNote) });
			for (const note of notes) {
				if (extractNoteLinks(note).length > 0) {
					await indexNoteLinks(note);
				}
			}
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

		async listTrash() {
			const records = await invoke<RustTrashRecord[]>("list_trash");
			return trashRecordsToBatches(records);
		},

		async restoreTrash(batchId) {
			await invoke("restore_trash", { batchId });
		},

		async purgeTrash(batchId) {
			await invoke("purge_trash", { batchId });
		},

		async emptyTrash() {
			await invoke("empty_trash");
		},

		listJournalEntries,
		listJournalTags,

		async createJournalEntry(input) {
			const id = input.id ?? crypto.randomUUID();
			const existing = (await listJournalEntries()).find((entry) => entry.id === id);
			const now = new Date();
			const entry: JournalEntry = {
				id,
				dateKey: input.dateKey,
				title: input.title ?? undefined,
				content: input.content,
				tags: input.tags ?? [],
				mood: input.mood ?? undefined,
				createdAt: existing?.createdAt ?? now,
				updatedAt: now,
			};
			await invoke("upsert_journal_entry", { entry: toRustJournalEntry(entry) });
			return entry;
		},

		async updateJournalEntry(input) {
			const existing = (await listJournalEntries()).find((entry) => entry.id === input.id);
			if (!existing) return undefined;
			const next: JournalEntry = {
				...existing,
				title: input.title === undefined ? existing.title : (input.title ?? undefined),
				content: input.content ?? existing.content,
				tags: input.tags ?? existing.tags,
				mood: input.mood === undefined ? existing.mood : (input.mood ?? undefined),
				updatedAt: new Date(),
			};
			await invoke("upsert_journal_entry", { entry: toRustJournalEntry(next) });
			return next;
		},

		async deleteJournalEntry(id) {
			await invoke("delete_journal_entry", { id });
		},

		async createJournalTag(input) {
			const tag: JournalTag = {
				id: crypto.randomUUID(),
				name: input.name,
				color: input.color,
				usageCount: 0,
			};
			await invoke("upsert_journal_tag", { tag });
			return tag;
		},

		// Mirrors the server cascade: strip the tag name from every entry that
		// carries it, then remove the tag itself. Each entry rewrite re-persists
		// through the vault + index, same as a normal edit.
		async deleteJournalTag(id) {
			const target = (await listJournalTags()).find((tag) => tag.id === id);
			if (!target) return;
			const entries = await listJournalEntries();
			for (const entry of entries) {
				if (!entry.tags.includes(target.name)) continue;
				const next: JournalEntry = {
					...entry,
					tags: entry.tags.filter((tag) => tag !== target.name),
					updatedAt: new Date(),
				};
				await invoke("upsert_journal_entry", { entry: toRustJournalEntry(next) });
			}
			await invoke("delete_journal_tag", { id });
		},
	};
}
