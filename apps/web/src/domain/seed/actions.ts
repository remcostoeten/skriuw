"use server";

import type { NoteFile } from "@/domain/notes/models";
import { loadGuestSeedNote, loadGuestWorkspaceSnapshot } from "@/domain/seed/guest-bundle";

export async function fetchGuestSeedNote(id: string): Promise<NoteFile | null> {
	return loadGuestSeedNote(id);
}

export async function fetchGuestSeedNotes(ids: string[]): Promise<NoteFile[]> {
	const requestedIds = new Set(ids.filter(Boolean));
	if (requestedIds.size === 0) return [];

	const snapshot = await loadGuestWorkspaceSnapshot();
	return snapshot.noteDetails.filter((note) => requestedIds.has(note.id));
}
