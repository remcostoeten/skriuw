import type { NoteAccessRole } from "@/domain/notes/models";
import { isGuestScopedId } from "@/domain/notes/note-id";

export function shouldQueryNoteCollaborators(
	noteId: string | null | undefined,
	access: NoteAccessRole | undefined,
	hasPartykitHost: boolean,
): noteId is string {
	if (!hasPartykitHost || !noteId || isGuestScopedId(noteId)) return false;
	return access !== "editor" && access !== "viewer";
}
