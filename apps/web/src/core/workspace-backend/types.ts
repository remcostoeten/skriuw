import type { UpdateNoteInput, UpdateNoteResult } from "@/domain/notes/actions";
import type { CreateFolderInput, UpdateFolderInput } from "@/domain/folders/actions";
import type { GraphData } from "@/domain/notes/graph";
import type { NoteFile, NoteFolder, NoteVersion } from "@/domain/notes/models";
import type { CreateNoteInput } from "@/domain/notes/note-write-core";
import type { ResolvedNoteLink } from "@/domain/notes/note-links";
import type { JournalEntry, JournalTag } from "@/domain/journal/models";
import type {
	CreateJournalEntryInput,
	CreateJournalTagInput,
	UpdateJournalEntryInput,
} from "@/domain/journal/actions";
import type { Person } from "@/domain/people/models";
import type { CreatePersonInput, UpdatePersonInput } from "@/domain/people/validation";
import type { NotePropertyColor } from "@/domain/notes/properties";
import type { Task } from "@/domain/tasks/models";
import type { CreateTaskInput, UpdateTaskInput } from "@/domain/tasks/actions";

/**
 * Feature switches a backend advertises so the UI can hide surfaces a given
 * backend cannot serve. The web `serverBackend` enables everything; the guest
 * `localBackend` (and the planned desktop `tauriBackend`) disable whatever they
 * cannot back with a real, network-connected service.
 */
export type WorkspaceCapabilities = {
	journal: boolean;
	tasks: boolean;
	sharing: boolean;
	collaboration: boolean;
	notifications: boolean;
	ai: boolean;
	trash: boolean;
	history: boolean;
	coverUpload: boolean;
};

/**
 * One restorable unit in the Trash. A standalone note delete is a single-item
 * batch; a folder delete groups the folder, its subfolders, and every note it
 * contained into one batch (so the Trash UI shows one row, not fifty). `id`
 * keys the batch for restore/purge — the deletedAt-ISO string on the web
 * backend, a generated `batchId` on the desktop backend.
 */
export type TrashBatch = {
	id: string;
	deletedAt: Date;
	kind: "note" | "folder";
	primary: { id: string; name: string };
	noteCount: number;
	folderCount: number;
};

/**
 * Backend-agnostic interface for workspace reads and mutations. Implementations:
 *
 * - serverBackend: wraps Prisma-backed server actions for authenticated users.
 * - localBackend: browser storage + seed bundle for unauthenticated guests.
 * - tauriBackend (planned): invokes a local Rust backend for the desktop build.
 *
 * Hooks consume this interface so feature code branches on neither auth state
 * nor platform. Whole-workspace list reads (note/journal listings) are still
 * RSC-hydrated and join this interface once the prefetch moves client-side.
 */
/**
 * A full-text search hit. `snippet` is a short excerpt with the matched terms
 * wrapped in `[` … `]`. Produced by the desktop backend (SQLite FTS5) and the
 * web backend (Postgres full-text). Callers must still treat `searchNotes` as
 * optional and fall back to in-memory filtering when it is absent (guest mode).
 */
export type NoteSearchHit = {
	id: string;
	name: string;
	snippet: string;
};

export type NoteSearchOptions = { semantic?: boolean };

/** One atomic desktop-sync pull payload — see `WorkspaceBackend.importArchive`. */
export type ImportArchivePayload = {
	folders: { id: string; name: string; parentId: string | null; sortOrder: number }[];
	notes: CreateNoteInput[];
	journalEntries: CreateJournalEntryInput[];
	journalTags: { name: string; color: string }[];
	/** Ids/names to remove locally — see `SkriuwExportDeletedIds`. Tags are matched by name. */
	deletedIds: {
		notes: string[];
		folders: string[];
		journalEntries: string[];
		journalTagNames: string[];
	};
};

/** A workspace note tag: derived usage joined with optional persisted color. */
export type TagSummary = {
	name: string;
	color: NotePropertyColor | null;
	noteCount: number;
};

/** Outcome of a tag/person rename, merge, or delete that rewrote note content. */
export type ChipRewriteResult = {
	rewrittenNoteIds: string[];
};

/** One note or journal entry that carries a given tag or mentions a given person. */
export type TaggedNoteSummary = {
	id: string;
	name: string;
	modifiedAt: Date;
	// "note" (default) links to the note in the editor; "journal" links to the
	// journal view. `dateKey` is set on journal entries for that navigation.
	kind?: "note" | "journal";
	dateKey?: string;
};

export type CoverImage = {
	url: string;
	pathname: string;
	size: number;
	/** Epoch millis of upload (or last modification), when the store exposes it. */
	uploadedAt?: number;
};

export type WorkspaceBackend = {
	readonly mode: "server" | "local" | "tauri";
	readonly capabilities: WorkspaceCapabilities;

	/**
	 * Full-text search across note names + bodies, ranked by relevance. Optional:
	 * the desktop (`tauri`) backend implements it via SQLite FTS5 and the web
	 * (`server`) backend via Postgres full-text; guest mode omits it, so the
	 * sidebar keeps doing in-memory name/tag filtering there.
	 */
	searchNotes?(
		query: string,
		limit?: number,
		options?: NoteSearchOptions,
	): Promise<NoteSearchHit[]>;

	/**
	 * Whole-list note/folder reads for client-only backends. Optional because the
	 * web/guest app hydrates these lists from RSC or seed snapshots and keeps
	 * using the React Query cache as the list source of truth.
	 */
	listNotes?(): Promise<NoteFile[]>;
	listFolders?(): Promise<NoteFolder[]>;

	createNote(input: CreateNoteInput): Promise<NoteFile>;
	updateNote(input: UpdateNoteInput): Promise<UpdateNoteResult>;

	/**
	 * Bulk-write fully-built notes in one shot, preserving their `createdAt`/
	 * `modifiedAt` (unlike `createNote`, which stamps "now"). Used by external
	 * importers that carry original timestamps. Optional: only the desktop
	 * (`tauri`) backend implements it against `bulk_upsert_notes`.
	 */
	importNotes?(notes: NoteFile[]): Promise<void>;

	/**
	 * Atomically applies a full desktop-sync pull (folders/notes/journal
	 * entries/tags to upsert, plus ids to remove for server-side deletions) in
	 * one backend-level transaction, so a crash mid-import can't leave a
	 * half-imported workspace. Optional: only the desktop (`tauri`) backend
	 * implements it, against `import_workspace_archive`; other backends never
	 * pull, so `pull-workspace.ts` falls back to a sequential per-item loop
	 * when this is absent.
	 */
	importArchive?(payload: ImportArchivePayload): Promise<void>;
	deleteNote(id: string): Promise<void>;

	/**
	 * Bulk soft-delete into the trash, used by the note-cleanup sweep. Optional:
	 * the server backend batches it into one UPDATE; callers fall back to
	 * looping `deleteNote` when absent.
	 */
	deleteNotes?(ids: string[]): Promise<void>;
	restoreNoteVersion(versionId: string): Promise<UpdateNoteResult>;

	getNote(id: string): Promise<NoteFile | null>;
	getNotes(ids: string[]): Promise<NoteFile[]>;
	getNoteVersions(id: string): Promise<NoteVersion[]>;
	getNoteBacklinks(id: string): Promise<ResolvedNoteLink[]>;
	getNoteGraph(): Promise<GraphData>;

	createFolder(input: CreateFolderInput): Promise<NoteFolder>;
	updateFolder(input: UpdateFolderInput): Promise<NoteFolder | undefined>;
	deleteFolder(id: string): Promise<void>;

	/**
	 * Trash bin surface. `deleteNote`/`deleteFolder` soft-delete into the trash;
	 * these read it, restore a batch back into the workspace, or remove data for
	 * real. Optional: only backends advertising the `trash` capability (server,
	 * tauri) implement them; the guest (`local`) backend hard-deletes and omits
	 * them.
	 */
	listTrash?(): Promise<TrashBatch[]>;
	restoreTrash?(batchId: string): Promise<void>;
	purgeTrash?(batchId: string): Promise<void>;
	emptyTrash?(): Promise<void>;

	/**
	 * Whole-list journal reads. Optional because the web (`server`) backend is
	 * still RSC-hydrated cache-first and never needs them on the client; the
	 * desktop (`tauri`) backend implements them so the journal loads with no
	 * server prefetch, and the guest (`local`) backend returns empty lists.
	 */
	listJournalEntries?(): Promise<JournalEntry[]>;
	listJournalTags?(): Promise<JournalTag[]>;

	createJournalEntry(input: CreateJournalEntryInput): Promise<JournalEntry>;
	updateJournalEntry(input: UpdateJournalEntryInput): Promise<JournalEntry | undefined>;
	deleteJournalEntry(id: string): Promise<void>;
	createJournalTag(input: CreateJournalTagInput): Promise<JournalTag>;
	deleteJournalTag(id: string): Promise<void>;

	/** Task lists are available to authenticated web workspaces and the local desktop vault. */
	listTasks?(): Promise<Task[]>;
	createTask?(input: CreateTaskInput): Promise<Task>;
	updateTask?(input: UpdateTaskInput): Promise<Task | undefined>;
	deleteTask?(id: string): Promise<void>;

	/**
	 * The shared workspace people directory backing `$mention` chips and
	 * person-type property fields (e.g. a template's "Attendees"). Every backend
	 * implements it so the same directory resolves on web (Prisma), desktop
	 * (SQLite), and guest (local) without the caller branching on backend.
	 */
	listPeople(): Promise<Person[]>;
	createPerson(input: CreatePersonInput): Promise<Person>;

	/**
	 * Tag and person management. Tag identity is the normalized name persisted
	 * on NoteLink rows; renames/merges/deletes propagate into note content via
	 * the shared chip-rewrite engine (domain/notes/chip-rewrite.ts) on every
	 * backend. `renameTag` onto an existing name is a merge. `deletePerson` and
	 * `mergePersons` rewrite `$` chips before touching the Person row.
	 */
	listTags(): Promise<TagSummary[]>;
	setTagColor(name: string, color: NotePropertyColor | null): Promise<void>;
	renameTag(from: string, to: string): Promise<ChipRewriteResult>;
	deleteTag(name: string): Promise<ChipRewriteResult>;
	listTagNotes(name: string): Promise<TaggedNoteSummary[]>;

	/**
	 * Uploads a note cover image and returns the value to persist on
	 * `NoteFile.cover`. Optional: gated behind `capabilities.coverUpload` —
	 * the server backend uploads to Vercel Blob and returns its public URL;
	 * the desktop (`tauri`) backend saves to the vault's on-disk asset store
	 * and returns a `vault-asset:` reference; the guest (`local`) backend has
	 * no durable storage to put it in, so it omits this method entirely.
	 */
	uploadCoverImage?(file: File): Promise<string>;

	/** Lists the current user's previously uploaded cover images, newest first. */
	listCoverImages?(): Promise<string[]>;

	/**
	 * Lists the current user's uploaded cover images newest-first with byte size
	 * and a delete handle. Optional: only backends with a durable, listable store
	 * (currently the server backend) implement it.
	 */
	listCoverImagesDetailed?(): Promise<CoverImage[]>;

	/** Permanently deletes one of the current user's uploaded cover images. */
	deleteCoverImage?(image: CoverImage): Promise<void>;

	updatePerson(input: UpdatePersonInput): Promise<Person>;
	deletePerson(id: string): Promise<ChipRewriteResult>;
	mergePersons(sourceId: string, targetId: string): Promise<ChipRewriteResult>;
	listPersonNotes(personId: string): Promise<TaggedNoteSummary[]>;
};
