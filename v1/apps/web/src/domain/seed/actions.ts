"use server";

import { z } from "zod";
import type { NoteFile } from "@/domain/notes/models";
import { isGuestScopedId } from "@/domain/notes/note-id";
import { loadGuestSeedNote, loadGuestWorkspaceSnapshot } from "@/domain/seed/guest-bundle";

const GUEST_SEED_ID_SCHEMA = z.string().min(1).max(128).refine(isGuestScopedId);
const MAX_GUEST_SEED_LOOKUP_IDS = 256;

function collectGuestSeedIds(ids: string[]): string[] {
	const requestedIds = new Set<string>();
	for (const id of ids) {
		if (requestedIds.size >= MAX_GUEST_SEED_LOOKUP_IDS) break;
		if (!GUEST_SEED_ID_SCHEMA.safeParse(id).success) continue;
		requestedIds.add(id);
	}
	return [...requestedIds];
}

// react-doctor-disable-next-line react-doctor/server-auth-actions -- public guest seed data; input is guest-id validated and account data is never read.
export async function fetchGuestSeedNote(id: string): Promise<NoteFile | null> {
	if (!GUEST_SEED_ID_SCHEMA.safeParse(id).success) return null;
	return loadGuestSeedNote(id);
}

// react-doctor-disable-next-line react-doctor/server-auth-actions -- public guest seed data; ids are validated, deduped, and capped before loading.
export async function fetchGuestSeedNotes(ids: string[]): Promise<NoteFile[]> {
	const requestedIds = new Set(collectGuestSeedIds(ids));
	if (requestedIds.size === 0) return [];

	const snapshot = await loadGuestWorkspaceSnapshot();
	return snapshot.noteDetails.filter((note) => requestedIds.has(note.id));
}
