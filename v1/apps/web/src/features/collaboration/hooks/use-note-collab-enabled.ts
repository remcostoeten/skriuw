"use client";

import { useQuery } from "@tanstack/react-query";
import { getCollaboratorsAction } from "@/domain/collaboration/actions";
import type { NoteAccessRole } from "@/domain/notes/models";
import { shouldQueryNoteCollaborators } from "./should-query-note-collaborators";

// Inlined at build time by Next for the client bundle. When unset, real-time
// collaboration is fully disabled and the editor behaves exactly as before —
// so a deployment without PartyKit configured is unaffected.
const PARTYKIT_HOST = process.env.NEXT_PUBLIC_PARTYKIT_HOST;

/**
 * Whether a note should open a real-time collaboration room. True when PartyKit
 * is configured AND the note is actually shared — either the viewer is a
 * collaborator (`access` is editor/viewer) or the owner has ≥1 collaborator.
 * Returns false for solo notes so they never pay CRDT/socket overhead.
 */
export function useNoteCollabEnabled(
	noteId: string | null | undefined,
	access: NoteAccessRole | undefined,
): boolean {
	const isCollaboratorViewer = access === "editor" || access === "viewer";
	// `access` undefined or "owner" means we're on the owner's read path; we only
	// know it's shared by checking for collaborators. (Shares the React Query
	// cache key used by the collaborators panel, so this is usually a cache hit.)
	const shouldQueryCollaborators = shouldQueryNoteCollaborators(
		noteId,
		access,
		Boolean(PARTYKIT_HOST),
	);

	const collaboratorsQuery = useQuery({
		queryKey: ["collaborators", noteId ?? ""],
		queryFn: () => getCollaboratorsAction(noteId as string),
		enabled: shouldQueryCollaborators,
		staleTime: 5 * 60 * 1000,
		retry: false,
	});

	if (!PARTYKIT_HOST || !noteId) return false;
	if (isCollaboratorViewer) return true;
	return (collaboratorsQuery.data?.length ?? 0) > 0;
}
