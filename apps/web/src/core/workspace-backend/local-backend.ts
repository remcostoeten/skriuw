"use client";

import type { QueryClient } from "@tanstack/react-query";
import type { UpdateNoteResult } from "@/domain/notes/actions";
import type { NoteFile, NoteFolder } from "@/domain/notes/models";
import { buildGraphFromNotes } from "@/domain/notes/graph-from-notes";
import { noop } from "@/shared/lib/noop";
import {
	applyFolderUpdate,
	applyNoteUpdate,
	collectFolderDescendants,
	folderFromCreateInput,
	noteFromCreateInput,
} from "./note-builders";
import { fetchGuestSeedNote, fetchGuestSeedNotes } from "@/domain/seed/actions";
import { notesKeys } from "@/features/notes/hooks/notes-keys";
import {
	clearGuestWorkspaceIndexedDB,
	clearGuestWorkspaceLocalStorageSync,
	createGuestWorkspaceStore,
	readGuestWorkspacePayloadFromLocalStorageSync,
	type GuestWorkspacePayload,
} from "./local-store";
import type { WorkspaceBackend } from "./types";
import { WorkspaceCapabilityError } from "./capability-error";

const ENGAGEMENT_STORAGE_KEY = "skriuw:guest:engagement:v1";
/** Edit counts at which we nudge the guest to create an account. */
const ENGAGEMENT_THRESHOLDS = [10, 25, 50];
/** Dispatched on `window` when a threshold is crossed. */
export const GUEST_SIGNUP_PROMPT_EVENT = "skriuw:guest:prompt-signup";

/**
 * Increments the guest edit counter and, when it crosses one of the configured
 * thresholds, broadcasts a one-time `CustomEvent` so a listener can surface a
 * sign-up prompt. Best-effort: storage failures are swallowed.
 */
function recordGuestEngagement(): void {
	if (!isBrowser()) return;
	try {
		const raw = window.localStorage.getItem(ENGAGEMENT_STORAGE_KEY);
		const previous = raw ? Number.parseInt(raw, 10) : 0;
		const next = (Number.isFinite(previous) ? previous : 0) + 1;
		window.localStorage.setItem(ENGAGEMENT_STORAGE_KEY, String(next));
		if (ENGAGEMENT_THRESHOLDS.includes(next)) {
			window.dispatchEvent(
				new CustomEvent(GUEST_SIGNUP_PROMPT_EVENT, { detail: { count: next } }),
			);
		}
	} catch {
		// ignore
		noop();
	}
}

function isBrowser(): boolean {
	return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

/**
 * Builds a guest-mode backend bound to a React Query cache. The cache provides
 * the "current" view of seed-derived data so first-time edits of seed notes
 * snapshot the full record before persisting, instead of fabricating defaults
 * that would clobber the seed name/parent on next reload.
 */
export function createLocalBackend(queryClient: QueryClient): WorkspaceBackend {
	const store = createGuestWorkspaceStore();
	const filesKey = notesKeys.files(notesKeys.localScope());
	const foldersKey = notesKeys.folders(notesKeys.localScope());

	function getCachedNote(id: string): NoteFile | null {
		const detail = queryClient.getQueryData<NoteFile | null>(notesKeys.detail(id));
		if (detail) return detail;
		const list = queryClient.getQueryData<NoteFile[]>(filesKey) ?? [];
		return list.find((note) => note.id === id) ?? null;
	}

	function getCachedFolder(id: string): NoteFolder | null {
		const list = queryClient.getQueryData<NoteFolder[]>(foldersKey) ?? [];
		return list.find((folder) => folder.id === id) ?? null;
	}

	return {
		mode: "local",
		capabilities: {
			journal: false,
			sharing: false,
			collaboration: false,
			notifications: false,
			ai: false,
			trash: false,
			history: false,
		},

		async getNote(id) {
			const stored = await store.read();
			const found = stored.notes.find((note) => note.id === id);
			if (found) return found;
			return fetchGuestSeedNote(id);
		},

		async getNotes(ids) {
			const stored = await store.read();
			const storedById = new Map(stored.notes.map((note) => [note.id, note]));
			const resolved: NoteFile[] = [];
			const missing: string[] = [];
			for (const id of ids) {
				const note = storedById.get(id);
				if (note) resolved.push(note);
				else missing.push(id);
			}
			if (missing.length > 0) {
				resolved.push(...(await fetchGuestSeedNotes(missing)));
			}
			return resolved;
		},

		async getNoteVersions() {
			return [];
		},

		async getNoteBacklinks() {
			return [];
		},

		async getNoteGraph() {
			const notes =
				queryClient.getQueryData<NoteFile[]>(filesKey) ?? (await store.read()).notes;
			return buildGraphFromNotes(notes);
		},

		async restoreNoteVersion() {
			return { note: undefined, versionCreated: false };
		},

		async createNote(input) {
			const note = noteFromCreateInput(input);
			await store.update((payload) => {
				payload.notes.push(note);
			});
			recordGuestEngagement();
			return note;
		},

		async updateNote(input) {
			const result = await store.updateMaybe<UpdateNoteResult>((payload) => {
				const index = payload.notes.findIndex((note) => note.id === input.id);
				if (index !== -1) {
					const next = applyNoteUpdate(payload.notes[index]!, input);
					payload.notes[index] = next;
					return {
						result: { note: next, versionCreated: false },
						shouldWrite: true,
					};
				}

				const existing = getCachedNote(input.id);
				if (!existing) {
					return {
						result: { note: undefined, versionCreated: false },
						shouldWrite: false,
					};
				}
				const next = applyNoteUpdate(existing, input);
				payload.notes.push(next);
				return {
					result: { note: next, versionCreated: false },
					shouldWrite: true,
				};
			});
			if (result.note) recordGuestEngagement();
			return result;
		},

		async deleteNote(id) {
			await store.update((payload) => {
				payload.notes = payload.notes.filter((note) => note.id !== id);
			});
		},

		async createFolder(input) {
			const folder = folderFromCreateInput(input);
			await store.update((payload) => {
				payload.folders.push(folder);
			});
			return folder;
		},

		async updateFolder(input) {
			return store.updateMaybe<NoteFolder | undefined>((payload) => {
				const index = payload.folders.findIndex((folder) => folder.id === input.id);
				if (index !== -1) {
					const next = applyFolderUpdate(payload.folders[index]!, input);
					payload.folders[index] = next;
					return { result: next, shouldWrite: true };
				}
				const existing = getCachedFolder(input.id);
				if (!existing) return { result: undefined, shouldWrite: false };
				const next = applyFolderUpdate(existing, input);
				payload.folders.push(next);
				return { result: next, shouldWrite: true };
			});
		},

		async deleteFolder(id) {
			await store.update((payload) => {
				const remove = collectFolderDescendants(payload.folders, id);
				payload.notes = payload.notes.filter(
					(note) => !note.parentId || !remove.has(note.parentId),
				);
				payload.folders = payload.folders.filter((folder) => !remove.has(folder.id));
			});
		},

		async listJournalEntries() {
			return [];
		},

		async listJournalTags() {
			return [];
		},

		async createJournalEntry() {
			throw new WorkspaceCapabilityError("journal");
		},

		async updateJournalEntry() {
			throw new WorkspaceCapabilityError("journal");
		},

		async deleteJournalEntry() {
			throw new WorkspaceCapabilityError("journal");
		},

		async createJournalTag() {
			throw new WorkspaceCapabilityError("journal");
		},

		async deleteJournalTag() {
			throw new WorkspaceCapabilityError("journal");
		},
	};
}

function mergeNotes(seedNotes: NoteFile[], stored: NoteFile[]): NoteFile[] {
	if (stored.length === 0) {
		return seedNotes;
	}
	const storedIds = new Set(stored.map((note) => note.id));
	const seedRemainder = seedNotes.filter((note) => !storedIds.has(note.id));
	return [...seedRemainder, ...stored];
}

function mergeFolders(seedFolders: NoteFolder[], stored: NoteFolder[]): NoteFolder[] {
	if (stored.length === 0) {
		return seedFolders;
	}
	const storedIds = new Set(stored.map((folder) => folder.id));
	const seedRemainder = seedFolders.filter((folder) => !storedIds.has(folder.id));
	return [...seedRemainder, ...stored];
}

export function mergeSeedWithGuestNotes(seedNotes: NoteFile[]): NoteFile[] {
	return mergeNotes(seedNotes, readGuestWorkspacePayloadFromLocalStorageSync().notes);
}

export function mergeSeedWithGuestFolders(seedFolders: NoteFolder[]): NoteFolder[] {
	return mergeFolders(seedFolders, readGuestWorkspacePayloadFromLocalStorageSync().folders);
}

export async function mergeSeedWithGuestWorkspace(
	seedNotes: NoteFile[],
	seedFolders: NoteFolder[],
): Promise<GuestWorkspacePayload> {
	const store = createGuestWorkspaceStore();
	const stored = await store.read();
	return {
		notes: mergeNotes(seedNotes, stored.notes),
		folders: mergeFolders(seedFolders, stored.folders),
	};
}

export async function resetGuestStorage(): Promise<void> {
	if (isBrowser()) {
		clearGuestWorkspaceLocalStorageSync();
		window.localStorage.removeItem(ENGAGEMENT_STORAGE_KEY);
	}
	await createGuestWorkspaceStore()
		.clear()
		.catch(async () => {
			await clearGuestWorkspaceIndexedDB();
		});
}
