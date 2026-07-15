// ---------------------------------------------------------------------------
// WorkspaceBackend contract (mobile copy)
//
// THE integration seam. On web this lives at
// apps/web/src/core/workspace-backend/types.ts and has four implementations
// (server, guest/IndexedDB, tauri, and now mobile). Phase 0 extracts it to
// @skriuw/domain; until then this trimmed copy declares exactly the surface the
// notes-only MVP needs. Capability-gated methods are optional — the UI must
// degrade gracefully when a capability is false.
// ---------------------------------------------------------------------------

import type { RichDocument } from "@/domain/rich-document";
import type {
	CreateJournalEntryWireInput,
	JournalEntryWire,
	MoodLevel,
	UpdateJournalEntryWireInput,
} from "@skriuw/domain/journal";

export type BackendMode = "server" | "guest" | "tauri" | "mobile";

/** Feature switches. The mobile MVP turns everything off except notes/folders/
 *  search. As post-MVP screens ship, flip these on. */
export type Capabilities = {
	journal: boolean;
	sharing: boolean;
	collaboration: boolean;
	notifications: boolean;
	ai: boolean;
	trash: boolean;
	history: boolean;
	coverUpload: boolean;
};

export const MOBILE_CAPABILITIES: Capabilities = {
	journal: true,
	sharing: false,
	collaboration: false,
	notifications: false,
	ai: false,
	trash: true,
	history: false,
	coverUpload: false,
};

export type JournalEntry = JournalEntryWire;
export type CreateJournalEntryInput = CreateJournalEntryWireInput;
export type UpdateJournalEntryInput = UpdateJournalEntryWireInput;
export type { MoodLevel };

export type PreferredEditorMode = "rich" | "raw";

/** Lightweight note used in lists — NO body. Mirrors the web RQ strategy where
 *  list responses carry metadata only and bodies are fetched per note. */
export type NoteSummary = {
	id: string;
	title: string;
	folderId: string | null;
	updatedAt: string;
	createdAt: string;
	coverUrl?: string | null;
	preview?: string;
	/** Manual order within a folder. Folders and notes share one sort space per
	 *  level, so this drives drag-to-reorder alongside {@link Folder.sortOrder}. */
	sortOrder: number;
};

/** A full note including its dual body representation. */
export type Note = NoteSummary & {
	content: string; // markdown
	richContent: RichDocument | null; // BlockNote JSON (null on raw saves)
	preferredEditorMode: PreferredEditorMode;
};

export type Folder = {
	id: string;
	name: string;
	parentId: string | null;
	updatedAt: string;
	sortOrder: number;
};

export type CreateFolderInput = {
	name: string;
	parentId?: string | null;
	sortOrder?: number;
};

export type UpdateFolderInput = {
	id: string;
	name?: string;
	parentId?: string | null;
	sortOrder?: number;
};

export type SearchResult = {
	noteId: string;
	title: string;
	snippet: string;
};

/** One restorable unit in the trash: a single note, or a deleted folder subtree
 *  plus everything inside it. Mirrors web's TrashBatch with wire-format dates. */
export type TrashBatch = {
	id: string;
	deletedAt: string;
	kind: "note" | "folder";
	primary: { id: string; name: string };
	noteCount: number;
	folderCount: number;
};

export type CreateNoteInput = {
	title: string;
	content?: string;
	folderId?: string | null;
};

export type UpdateNoteInput = {
	id: string;
	title?: string;
	content?: string;
	folderId?: string | null;
	sortOrder?: number;
	/** Optimistic-concurrency guard: server rejects if it has a newer version.
	 *  Foundation for real conflict detection / sync later. */
	expectedUpdatedAt?: string;
};

/** The methods the mobile MVP calls. Optional methods are capability-gated and
 *  only implemented as those capabilities come online. */
export interface WorkspaceBackend {
	readonly mode: BackendMode;
	readonly capabilities: Capabilities;

	// Notes
	listNotes(folderId?: string | null): Promise<NoteSummary[]>;
	getNote(id: string): Promise<Note>;
	createNote(input: CreateNoteInput): Promise<Note>;
	updateNote(input: UpdateNoteInput): Promise<Note>;
	deleteNote(id: string): Promise<void>;

	// Folders
	listFolders(): Promise<Folder[]>;
	createFolder(input: CreateFolderInput): Promise<Folder>;
	updateFolder(input: UpdateFolderInput): Promise<Folder>;
	deleteFolder(id: string): Promise<void>;

	// Search
	search(query: string): Promise<SearchResult[]>;

	// Trash (capability: trash)
	listTrash(): Promise<TrashBatch[]>;
	restoreTrash(batchId: string): Promise<void>;
	purgeTrash(batchId: string): Promise<void>;
	emptyTrash(): Promise<void>;

	// Journal
	listJournalEntries(): Promise<JournalEntry[]>;
	createJournalEntry(input: CreateJournalEntryInput): Promise<JournalEntry>;
	updateJournalEntry(input: UpdateJournalEntryInput): Promise<JournalEntry>;
	deleteJournalEntry(id: string): Promise<void>;
}

/** Thrown when a PATCH precondition fails (someone else edited the note). */
export class ConflictError extends Error {
	constructor(public readonly serverUpdatedAt?: string) {
		super("Note was modified elsewhere");
		this.name = "ConflictError";
	}
}
