"use client";

import type { QueryClient } from "@tanstack/react-query";
import type { UpdateNoteResult } from "@/domain/notes/actions";
import type { NoteFile, NoteFolder } from "@/domain/notes/models";
import type { Person } from "@/domain/people/models";
import type { NotePropertyColor } from "@/domain/notes/properties";
import { buildGraphFromNotes } from "@/domain/notes/graph-from-notes";
import {
	rewriteNoteForPerson,
	rewriteNoteForTag,
	type NoteChipPatch,
} from "@/domain/notes/chip-rewrite";
import { buildDesiredNoteLinkRows } from "@/domain/notes/note-link-sync";
import { extractRichDocumentPersonIds } from "@/domain/notes/rich-document";
import { normalizeStoredTagEntry, normalizeTagName } from "@/domain/tags/normalize";
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
	getGuestWorkspaceStore,
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
	const store = getGuestWorkspaceStore();
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

	// The full guest note universe: the files cache carries seed notes the store
	// only learns about on first edit; stored versions win over cached ones.
	async function allNotes(): Promise<NoteFile[]> {
		const stored = (await store.read()).notes;
		const cached = queryClient.getQueryData<NoteFile[]>(filesKey);
		if (!cached) return stored;
		const storedById = new Map(stored.map((note) => [note.id, note]));
		const merged = cached.map((note) => storedById.get(note.id) ?? note);
		const cachedIds = new Set(cached.map((note) => note.id));
		return [...merged, ...stored.filter((note) => !cachedIds.has(note.id))];
	}

	async function rewriteNotes(
		buildPatch: (note: NoteFile) => NoteChipPatch | null,
	): Promise<string[]> {
		const universe = await allNotes();
		const rewritten: string[] = [];

		await store.update((payload) => {
			for (const note of universe) {
				const patch = buildPatch(note);
				if (!patch) continue;
				const next: NoteFile = { ...note, ...patch, modifiedAt: new Date() };
				const index = payload.notes.findIndex((stored) => stored.id === note.id);
				if (index !== -1) payload.notes[index] = next;
				else payload.notes.push(next);
				rewritten.push(note.id);
			}
		});

		return rewritten;
	}

	function noteMentionsPerson(note: NoteFile, personId: string): boolean {
		if (extractRichDocumentPersonIds(note.richContent).includes(personId)) return true;
		return (note.properties ?? []).some(
			(property) =>
				property.type === "person" &&
				Array.isArray(property.value) &&
				property.value.includes(personId),
		);
	}

	function noteTagLabels(note: NoteFile): Set<string> {
		const labels = new Set<string>();
		for (const row of buildDesiredNoteLinkRows("local", note)) {
			if (row.kind === "tag") labels.add(row.targetLabel);
		}
		return labels;
	}

	function toNoteSummary(note: NoteFile) {
		return { id: note.id, name: note.name, modifiedAt: note.modifiedAt };
	}

	function byModifiedDesc(
		left: { modifiedAt: Date },
		right: { modifiedAt: Date },
	): number {
		return right.modifiedAt.getTime() - left.modifiedAt.getTime();
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
			const [notes, payload] = await Promise.all([allNotes(), store.read()]);
			return buildGraphFromNotes(notes, payload.people);
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

		async listPeople() {
			return (await store.read()).people;
		},

		async createPerson(input) {
			return store.update((payload) => {
				const existing = payload.people.find(
					(person) => person.name.toLowerCase() === input.name.toLowerCase(),
				);
				if (existing) return { ...existing };
				const person: Person = {
					id: input.id ?? crypto.randomUUID(),
					name: input.name,
					color: input.color ?? null,
				};
				payload.people.push(person);
				return { ...person };
			});
		},

		async updatePerson(input) {
			return store.update((payload) => {
				const person = payload.people.find((entry) => entry.id === input.id);
				if (!person) throw new Error("Person not found");
				if (input.name !== undefined) person.name = input.name;
				if (input.color !== undefined) person.color = input.color ?? null;
				return { ...person };
			});
		},

		async deletePerson(id) {
			const person = (await store.read()).people.find((entry) => entry.id === id);
			if (!person) return { rewrittenNoteIds: [] };
			const rewrittenNoteIds = await rewriteNotes((note) =>
				rewriteNoteForPerson(note, { fromId: id, toId: null, removalText: person.name }),
			);
			await store.update((payload) => {
				payload.people = payload.people.filter((entry) => entry.id !== id);
			});
			return { rewrittenNoteIds };
		},

		async mergePersons(sourceId, targetId) {
			if (sourceId === targetId) return { rewrittenNoteIds: [] };
			const people = (await store.read()).people;
			const source = people.find((entry) => entry.id === sourceId);
			const target = people.find((entry) => entry.id === targetId);
			if (!source || !target) return { rewrittenNoteIds: [] };
			const rewrittenNoteIds = await rewriteNotes((note) =>
				rewriteNoteForPerson(note, { fromId: sourceId, toId: targetId, toName: target.name }),
			);
			await store.update((payload) => {
				payload.people = payload.people.filter((entry) => entry.id !== sourceId);
			});
			return { rewrittenNoteIds };
		},

		async listPersonNotes(personId) {
			const notes = await allNotes();
			return notes
				.filter((note) => noteMentionsPerson(note, personId))
				.map(toNoteSummary)
				.toSorted(byModifiedDesc);
		},

		async listTags() {
			const [notes, payload] = await Promise.all([allNotes(), store.read()]);
			const notesByTag = new Map<string, number>();
			for (const note of notes) {
				for (const label of noteTagLabels(note)) {
					notesByTag.set(label, (notesByTag.get(label) ?? 0) + 1);
				}
			}
			const colorByName = new Map(payload.tagMeta.map((meta) => [meta.name, meta.color]));
			const names = new Set([...notesByTag.keys(), ...colorByName.keys()]);
			return [...names]
				.map((name) => ({
					name,
					color: (colorByName.get(name) as NotePropertyColor | null | undefined) ?? null,
					noteCount: notesByTag.get(name) ?? 0,
				}))
				.toSorted((left, right) =>
					right.noteCount !== left.noteCount
						? right.noteCount - left.noteCount
						: left.name.localeCompare(right.name),
				);
		},

		async setTagColor(name, color) {
			const normalized = normalizeStoredTagEntry(name);
			if (!normalized) return;
			await store.update((payload) => {
				payload.tagMeta = payload.tagMeta.filter((meta) => meta.name !== normalized);
				if (color !== null) {
					payload.tagMeta.push({ name: normalized, color });
				}
			});
		},

		async renameTag(from, to) {
			const source = normalizeStoredTagEntry(from);
			const target = normalizeTagName(to);
			if (!source || !target || source === target) return { rewrittenNoteIds: [] };
			const rewrittenNoteIds = await rewriteNotes((note) =>
				rewriteNoteForTag(note, source, target),
			);
			await store.update((payload) => {
				const sourceMeta = payload.tagMeta.find((meta) => meta.name === source);
				const targetMeta = payload.tagMeta.find((meta) => meta.name === target);
				payload.tagMeta = payload.tagMeta.filter((meta) => meta.name !== source);
				if (sourceMeta?.color && !targetMeta) {
					payload.tagMeta.push({ name: target, color: sourceMeta.color });
				}
			});
			return { rewrittenNoteIds };
		},

		async deleteTag(name) {
			const normalized = normalizeStoredTagEntry(name);
			if (!normalized) return { rewrittenNoteIds: [] };
			const rewrittenNoteIds = await rewriteNotes((note) =>
				rewriteNoteForTag(note, normalized, null),
			);
			await store.update((payload) => {
				payload.tagMeta = payload.tagMeta.filter((meta) => meta.name !== normalized);
			});
			return { rewrittenNoteIds };
		},

		async listTagNotes(name) {
			const normalized = normalizeStoredTagEntry(name);
			if (!normalized) return [];
			const notes = await allNotes();
			return notes
				.filter((note) => noteTagLabels(note).has(normalized))
				.map(toNoteSummary)
				.toSorted(byModifiedDesc);
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
	const store = getGuestWorkspaceStore();
	const stored = await store.read();
	return {
		...stored,
		notes: mergeNotes(seedNotes, stored.notes),
		folders: mergeFolders(seedFolders, stored.folders),
	};
}

export async function resetGuestStorage(): Promise<void> {
	if (isBrowser()) {
		clearGuestWorkspaceLocalStorageSync();
		window.localStorage.removeItem(ENGAGEMENT_STORAGE_KEY);
	}
	await getGuestWorkspaceStore()
		.clear()
		.catch(async () => {
			await clearGuestWorkspaceIndexedDB();
		});
}
