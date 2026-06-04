import type {
	CreateNoteInput,
	UpdateNoteInput,
	UpdateNoteResult,
} from "@/domain/notes/actions";
import type {
	CreateFolderInput,
	UpdateFolderInput,
} from "@/domain/folders/actions";
import type { NoteFile, NoteFolder } from "@/domain/notes/models";

/**
 * Backend-agnostic interface for workspace mutations. Two implementations exist:
 *
 * - ServerBackend: wraps Prisma-backed server actions for authenticated users.
 * - LocalBackend: writes to browser storage for unauthenticated guests so they
 *   can explore a pre-seeded workspace without touching the database.
 *
 * Hooks consume this interface so feature code does not branch on auth state.
 */
export type WorkspaceBackend = {
	readonly mode: "server" | "local";

	createNote(input: CreateNoteInput): Promise<NoteFile>;
	updateNote(input: UpdateNoteInput): Promise<UpdateNoteResult>;
	deleteNote(id: string): Promise<void>;

	createFolder(input: CreateFolderInput): Promise<NoteFolder>;
	updateFolder(input: UpdateFolderInput): Promise<NoteFolder | undefined>;
	deleteFolder(id: string): Promise<void>;
};
