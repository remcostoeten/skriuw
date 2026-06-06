"use server";

import type { NoteFile } from "@/domain/notes/models";
import { loadGuestSeedNote } from "@/domain/seed/guest-bundle";

export async function fetchGuestSeedNote(id: string): Promise<NoteFile | null> {
	return loadGuestSeedNote(id);
}
