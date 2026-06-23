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
export type WorkspaceBackend = {
	readonly mode: "server" | "local" | "tauri";
	readonly capabilities: WorkspaceCapabilities;

	createNote(input: CreateNoteInput): Promise<NoteFile>;
	updateNote(input: UpdateNoteInput): Promise<UpdateNoteResult>;
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

	createJournalEntry(input: CreateJournalEntryInput): Promise<JournalEntry>;
	updateJournalEntry(input: UpdateJournalEntryInput): Promise<JournalEntry | undefined>;
	deleteJournalEntry(id: string): Promise<void>;
	createJournalTag(input: CreateJournalTagInput): Promise<JournalTag>;
	deleteJournalTag(id: string): Promise<void>;
};
