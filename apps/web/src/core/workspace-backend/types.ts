import type {
	CreateNoteInput,
	UpdateNoteInput,
	UpdateNoteResult,
} from "@/domain/notes/actions";
import type {
	CreateFolderInput,
	UpdateFolderInput,
} from "@/domain/folders/actions";
import type { GraphData } from "@/domain/notes/graph";
import type { NoteFile, NoteFolder, NoteVersion } from "@/domain/notes/models";
import type { ResolvedNoteLink } from "@/domain/notes/note-links";
import type { JournalEntry, JournalTag } from "@/domain/journal/models";
import type {
	CreateJournalEntryInput,
	CreateJournalTagInput,
	UpdateJournalEntryInput,
} from "@/domain/journal/actions";

/**
 * Feature switches a backend advertises so the UI can hide surfaces a given
 * backend cannot serve. The web `serverBackend` enables everything; the guest
 * `localBackend` (and the planned desktop `tauriBackend`) disable whatever they
 * cannot back with a real, network-connected service.
 */
export type WorkspaceCapabilities = {
	journal: boolean;
	sharing: boolean;
	collaboration: boolean;
	notifications: boolean;
	ai: boolean;
	trash: boolean;
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
 * wrapped in `[` … `]`. Currently produced only by the desktop backend (SQLite
 * FTS5); callers must treat `searchNotes` as optional and fall back to in-memory
 * filtering when it is absent.
 */
export type NoteSearchHit = {
	id: string;
	name: string;
	snippet: string;
};

export type WorkspaceBackend = {
	readonly mode: "server" | "local" | "tauri";
	readonly capabilities: WorkspaceCapabilities;

	/**
	 * Full-text search across note names + bodies, ranked by relevance. Optional:
	 * only the desktop (`tauri`) backend implements it via SQLite FTS5; on web/
	 * guest the sidebar keeps doing in-memory name/tag filtering.
	 */
	searchNotes?(query: string, limit?: number): Promise<NoteSearchHit[]>;

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
	deleteNote(id: string): Promise<void>;
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
};
