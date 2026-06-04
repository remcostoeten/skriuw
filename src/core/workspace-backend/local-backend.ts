"use client";

import type { QueryClient } from "@tanstack/react-query";
import type {
	CreateNoteInput,
	UpdateNoteInput,
} from "@/domain/notes/actions";
import type {
	CreateFolderInput,
	UpdateFolderInput,
} from "@/domain/folders/actions";
import type { NoteFile, NoteFolder, RichTextDocument } from "@/domain/notes/models";
import { markdownToRichDocument } from "@/domain/notes/rich-document";
import { notesKeys } from "@/features/notes/hooks/notes-keys";
import type { WorkspaceBackend } from "./types";

const STORAGE_KEY = "skriuw:guest:workspace:v2";
const LEGACY_STORAGE_KEYS = ["skriuw:guest:workspace:v1"];

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
	}
}

function clearLegacyStorage(): void {
	if (!isBrowser()) return;
	for (const key of LEGACY_STORAGE_KEYS) {
		try {
			window.localStorage.removeItem(key);
		} catch {
			// ignore
		}
	}
}

type GuestStoragePayload = {
	notes: NoteFile[];
	folders: NoteFolder[];
};

function emptyPayload(): GuestStoragePayload {
	return { notes: [], folders: [] };
}

function isBrowser(): boolean {
	return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function reviveNote(raw: NoteFile): NoteFile {
	return {
		...raw,
		createdAt: new Date(raw.createdAt as unknown as string),
		modifiedAt: new Date(raw.modifiedAt as unknown as string),
	};
}

function readPayload(): GuestStoragePayload {
	if (!isBrowser()) return emptyPayload();
	clearLegacyStorage();
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return emptyPayload();
		const parsed = JSON.parse(raw) as Partial<GuestStoragePayload>;
		return {
			notes: Array.isArray(parsed.notes) ? parsed.notes.map(reviveNote) : [],
			folders: Array.isArray(parsed.folders) ? parsed.folders : [],
		};
	} catch {
		return emptyPayload();
	}
}

function writePayload(payload: GuestStoragePayload): void {
	if (!isBrowser()) return;
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
	} catch {
		// Quota exceeded or storage disabled — fail silent; guest mode is best-effort.
	}
}

function ensureNoteName(name: string): string {
	const trimmed = name.trim() || "Untitled";
	return trimmed.endsWith(".md") ? trimmed : `${trimmed}.md`;
}

function noteFromCreateInput(input: CreateNoteInput): NoteFile {
	const richContent: RichTextDocument =
		input.richContent ?? markdownToRichDocument(input.content ?? "");
	const now = new Date();
	return {
		id: input.id ?? crypto.randomUUID(),
		name: ensureNoteName(input.name),
		content: input.content ?? "",
		richContent,
		preferredEditorMode: input.preferredEditorMode ?? "block",
		createdAt: now,
		modifiedAt: now,
		parentId: input.parentId ?? null,
		sortOrder: input.sortOrder ?? 0,
		tags: input.tags ?? [],
	};
}

function applyNoteUpdate(note: NoteFile, input: UpdateNoteInput): NoteFile {
	return {
		...note,
		name: input.name !== undefined ? ensureNoteName(input.name) : note.name,
		content: input.content ?? note.content,
		richContent: input.richContent ?? note.richContent,
		preferredEditorMode: input.preferredEditorMode ?? note.preferredEditorMode,
		parentId: input.parentId !== undefined ? input.parentId : note.parentId,
		sortOrder: input.sortOrder ?? note.sortOrder,
		tags: input.tags ?? note.tags,
		modifiedAt: new Date(),
	};
}

function folderFromCreateInput(input: CreateFolderInput): NoteFolder {
	return {
		id: input.id ?? crypto.randomUUID(),
		name: input.name,
		parentId: input.parentId ?? null,
		sortOrder: input.sortOrder ?? 0,
		isOpen: true,
	};
}

function applyFolderUpdate(folder: NoteFolder, input: UpdateFolderInput): NoteFolder {
	return {
		...folder,
		name: input.name ?? folder.name,
		parentId: input.parentId === undefined ? folder.parentId : input.parentId,
		sortOrder: input.sortOrder === undefined ? folder.sortOrder : input.sortOrder,
	};
}

function collectFolderDescendants(folders: NoteFolder[], rootId: string): Set<string> {
	const descendants = new Set<string>([rootId]);
	const stack = [rootId];
	while (stack.length > 0) {
		const next = stack.pop()!;
		for (const folder of folders) {
			if (folder.parentId === next && !descendants.has(folder.id)) {
				descendants.add(folder.id);
				stack.push(folder.id);
			}
		}
	}
	return descendants;
}

/**
 * Builds a guest-mode backend bound to a React Query cache. The cache provides
 * the "current" view of seed-derived data so first-time edits of seed notes
 * snapshot the full record before persisting, instead of fabricating defaults
 * that would clobber the seed name/parent on next reload.
 */
export function createLocalBackend(queryClient: QueryClient): WorkspaceBackend {
	function getCachedNote(id: string): NoteFile | null {
		const detail = queryClient.getQueryData<NoteFile | null>(notesKeys.detail(id));
		if (detail) return detail;
		const list = queryClient.getQueryData<NoteFile[]>(notesKeys.files()) ?? [];
		return list.find((note) => note.id === id) ?? null;
	}

	function getCachedFolder(id: string): NoteFolder | null {
		const list = queryClient.getQueryData<NoteFolder[]>(notesKeys.folders()) ?? [];
		return list.find((folder) => folder.id === id) ?? null;
	}

	return {
		mode: "local",

		async createNote(input) {
			const payload = readPayload();
			const note = noteFromCreateInput(input);
			payload.notes.push(note);
			writePayload(payload);
			recordGuestEngagement();
			return note;
		},

		async updateNote(input) {
			const payload = readPayload();
			const index = payload.notes.findIndex((note) => note.id === input.id);
			if (index !== -1) {
				const next = applyNoteUpdate(payload.notes[index]!, input);
				payload.notes[index] = next;
				writePayload(payload);
				recordGuestEngagement();
				return { note: next, versionCreated: false };
			}

			const existing = getCachedNote(input.id);
			if (!existing) {
				return { note: undefined, versionCreated: false };
			}
			const next = applyNoteUpdate(existing, input);
			payload.notes.push(next);
			writePayload(payload);
			recordGuestEngagement();
			return { note: next, versionCreated: false };
		},

		async deleteNote(id) {
			const payload = readPayload();
			writePayload({
				...payload,
				notes: payload.notes.filter((note) => note.id !== id),
			});
		},

		async createFolder(input) {
			const payload = readPayload();
			const folder = folderFromCreateInput(input);
			payload.folders.push(folder);
			writePayload(payload);
			return folder;
		},

		async updateFolder(input) {
			const payload = readPayload();
			const index = payload.folders.findIndex((folder) => folder.id === input.id);
			if (index !== -1) {
				const next = applyFolderUpdate(payload.folders[index]!, input);
				payload.folders[index] = next;
				writePayload(payload);
				return next;
			}
			const existing = getCachedFolder(input.id);
			if (!existing) return undefined;
			const next = applyFolderUpdate(existing, input);
			payload.folders.push(next);
			writePayload(payload);
			return next;
		},

		async deleteFolder(id) {
			const payload = readPayload();
			const remove = collectFolderDescendants(payload.folders, id);
			writePayload({
				notes: payload.notes.filter((note) => !note.parentId || !remove.has(note.parentId)),
				folders: payload.folders.filter((folder) => !remove.has(folder.id)),
			});
		},
	};
}

export function mergeSeedWithGuestNotes(seedNotes: NoteFile[]): NoteFile[] {
	const stored = readPayload().notes;
	if (stored.length === 0) {
		return seedNotes;
	}
	const storedIds = new Set(stored.map((note) => note.id));
	const seedRemainder = seedNotes.filter((note) => !storedIds.has(note.id));
	return [...seedRemainder, ...stored];
}

export function mergeSeedWithGuestFolders(seedFolders: NoteFolder[]): NoteFolder[] {
	const stored = readPayload().folders;
	if (stored.length === 0) {
		return seedFolders;
	}
	const storedIds = new Set(stored.map((folder) => folder.id));
	const seedRemainder = seedFolders.filter((folder) => !storedIds.has(folder.id));
	return [...seedRemainder, ...stored];
}

export function resetGuestStorage(): void {
	if (!isBrowser()) return;
	window.localStorage.removeItem(STORAGE_KEY);
	window.localStorage.removeItem(ENGAGEMENT_STORAGE_KEY);
}
