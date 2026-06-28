"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { type UpdateNoteInput } from "@/domain/notes/actions";
import { useWorkspaceBackend } from "@/core/workspace-backend";
import { markdownToRichDocument } from "@/domain/notes/rich-document";
import type { NoteEditorMode, NoteFile, RichTextDocument } from "@/types/notes";
import { notesKeys } from "./notes-keys";
import { reconcileSavedNoteCache } from "@/features/notes/lib/note-cache";

type DebouncedUpdateOptions = {
	onSaving?: (noteId: string) => void;
	onSaved?: (noteId: string) => void;
	onError?: (noteId: string) => void;
};

// Idle window after the last keystroke before a note's pending edits are
// persisted on their own. Without this the only flush points are editor blur,
// note switches, and page-unload events — none of which fire reliably in the
// Tauri desktop webview (closing the window never emits `beforeunload`), so
// edits would sit in memory showing "saving" forever and never reach the vault.
// This idle save is checkpoint-free; blur/switch/unload still create version
// checkpoints, so version history is unchanged.
const AUTOSAVE_DEBOUNCE_MS = 1000;

type DebouncedContentArgs = {
	id: string;
	content: string;
	richContent?: RichTextDocument;
	preferredEditorMode?: NoteEditorMode;
};

type PendingEdit = {
	content: string;
	richContent: RichTextDocument;
	preferredEditorMode?: NoteEditorMode;
};

export type DebouncedSaveController = {
	schedule(args: DebouncedContentArgs): void;
	flush(
		noteId: string,
		options?: { createCheckpoint?: boolean },
	): Promise<void>;
	flushAll(options?: { createCheckpoint?: boolean }): Promise<void>;
	discardPending(noteId: string): void;
	getDirtyNoteIds(): string[];
};

export function useDebouncedSave(
	options: DebouncedUpdateOptions = {},
): DebouncedSaveController {
	const queryClient = useQueryClient();
	const backend = useWorkspaceBackend();
	const updateNoteRef = useRef(backend.updateNote);
	useEffect(() => {
		updateNoteRef.current = backend.updateNote;
	}, [backend]);
	const versionsRef = useRef(new Map<string, number>());
	const sessionVersionIdsRef = useRef(new Map<string, string>());
	const flushQueuesRef = useRef(new Map<string, Promise<void>>());
	const pendingRef = useRef(new Map<string, PendingEdit>());
	const dirtyRef = useRef(new Set<string>());
	const idleTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
	const optionsRef = useRef(options);

	useEffect(() => {
		optionsRef.current = options;
	}, [options]);

	useEffect(() => {
		const idleTimers = idleTimersRef.current;
		return () => {
			for (const timer of idleTimers.values()) clearTimeout(timer);
			idleTimers.clear();
		};
	}, []);

	return useMemo<DebouncedSaveController>(() => {
		// Autosaves only persist content — never the name. The filename follows the
		// first heading, but that rename is committed by the editor when the user
		// leaves the heading block (blur / Enter / navigate away), via an explicit
		// rename. Deriving the name here on every keystroke is what made the sidebar
		// rename mid-edit, so the cached name is left untouched.
		function applyOptimisticCache(
			id: string,
			content: string,
			richContent: RichTextDocument,
			preferredEditorMode: NoteEditorMode | undefined,
			updatedAt: Date,
		) {
			queryClient.setQueryData<NoteFile[]>(notesKeys.files(), (current = []) =>
				current.map((note) =>
					note.id === id
						? {
								...note,
								content,
								richContent,
								preferredEditorMode:
									preferredEditorMode ?? note.preferredEditorMode,
								modifiedAt: updatedAt,
							}
						: note,
				),
			);
			queryClient.setQueryData<NoteFile | null>(
				notesKeys.detail(id),
				(current) =>
					current
						? {
								...current,
								content,
								richContent,
								preferredEditorMode:
									preferredEditorMode ?? current.preferredEditorMode,
								modifiedAt: updatedAt,
							}
						: current,
			);
		}

		async function sendUpdate(
			id: string,
			edit: PendingEdit,
			createCheckpoint: boolean,
		): Promise<boolean> {
			const baselineVersion = versionsRef.current.get(id) ?? 0;

			const input: UpdateNoteInput = {
				id,
				content: edit.content,
				richContent: edit.richContent,
				preferredEditorMode: edit.preferredEditorMode,
				// Autosaves never rename. The filename follows the first heading only
				// when the editor commits it (the user leaves the heading block),
				// which sends an explicit `name`.
				trackHeading: false,
				createCheckpoint: createCheckpoint || undefined,
				sessionVersionId: createCheckpoint
					? sessionVersionIdsRef.current.get(id)
					: undefined,
			};

			try {
				const result = await updateNoteRef.current(input);
				if (!result.note || (versionsRef.current.get(id) ?? 0) !== baselineVersion) {
					return false;
				}
				if (createCheckpoint && result.versionId) {
					sessionVersionIdsRef.current.set(id, result.versionId);
				}
				reconcileSavedNoteCache(queryClient, input, result);
				optionsRef.current.onSaved?.(id);
				return true;
			} catch {
				if ((versionsRef.current.get(id) ?? 0) !== baselineVersion) {
					return false;
				}
				optionsRef.current.onError?.(id);
				return false;
			}
		}

		function clearIdleTimer(id: string) {
			const timer = idleTimersRef.current.get(id);
			if (timer === undefined) return;
			clearTimeout(timer);
			idleTimersRef.current.delete(id);
		}

		// Persist on its own once typing pauses. Checkpoint-free so it never
		// inflates version history; the dirty flag is left set so the next
		// blur/switch/unload flush still records a checkpoint.
		function scheduleIdleFlush(id: string) {
			clearIdleTimer(id);
			const timer = setTimeout(() => {
				idleTimersRef.current.delete(id);
				void flush(id, { createCheckpoint: false });
			}, AUTOSAVE_DEBOUNCE_MS);
			idleTimersRef.current.set(id, timer);
		}

		function schedule({
			id,
			content,
			richContent,
			preferredEditorMode,
		}: DebouncedContentArgs) {
			versionsRef.current.set(id, (versionsRef.current.get(id) ?? 0) + 1);

			const updatedAt = new Date();
			const nextRichContent = richContent ?? markdownToRichDocument(content);

			pendingRef.current.set(id, {
				content,
				richContent: nextRichContent,
				preferredEditorMode,
			});
			dirtyRef.current.add(id);

			applyOptimisticCache(
				id,
				content,
				nextRichContent,
				preferredEditorMode,
				updatedAt,
			);

			optionsRef.current.onSaving?.(id);
			scheduleIdleFlush(id);
		}

		async function flushNow(
			noteId: string,
			flushOptions: { createCheckpoint?: boolean } = {},
		): Promise<void> {
			// A flush is in flight; cancel the pending idle save so it can't
			// re-fire a redundant write a beat later.
			clearIdleTimer(noteId);
			const pending = pendingRef.current.get(noteId);
			const wantsCheckpoint = flushOptions.createCheckpoint ?? true;
			const wasDirty = dirtyRef.current.has(noteId);

			if (pending) {
				const saved = await sendUpdate(noteId, pending, wantsCheckpoint);
				if (saved) {
					pendingRef.current.delete(noteId);
					if (wantsCheckpoint) dirtyRef.current.delete(noteId);
					return;
				}

				pendingRef.current.set(noteId, pending);
				dirtyRef.current.add(noteId);
				return;
			}

			if (wantsCheckpoint && wasDirty) {
				const snapshot = queryClient.getQueryData<NoteFile | null>(
					notesKeys.detail(noteId),
				);
				if (!snapshot) return;

				const saved = await sendUpdate(
					noteId,
					{
						content: snapshot.content,
						richContent: snapshot.richContent,
						preferredEditorMode: snapshot.preferredEditorMode,
					},
					true,
				);
				if (saved) {
					dirtyRef.current.delete(noteId);
				}
			}
		}

		async function flush(
			noteId: string,
			flushOptions: { createCheckpoint?: boolean } = {},
		): Promise<void> {
			const previousFlush = flushQueuesRef.current.get(noteId) ?? Promise.resolve();
			const nextFlush = previousFlush
				.catch(() => {})
				.then(() => flushNow(noteId, flushOptions));

			flushQueuesRef.current.set(noteId, nextFlush);
			try {
				await nextFlush;
			} finally {
				if (flushQueuesRef.current.get(noteId) === nextFlush) {
					flushQueuesRef.current.delete(noteId);
				}
			}
		}

		async function flushAll(
			flushOptions: { createCheckpoint?: boolean } = {},
		): Promise<void> {
			const ids = new Set<string>([
				...pendingRef.current.keys(),
				...dirtyRef.current,
			]);
			await Promise.all(Array.from(ids).map((id) => flush(id, flushOptions)));
		}

		function discardPending(noteId: string) {
			clearIdleTimer(noteId);
			pendingRef.current.delete(noteId);
			dirtyRef.current.delete(noteId);
			versionsRef.current.set(noteId, (versionsRef.current.get(noteId) ?? 0) + 1);
		}

		function getDirtyNoteIds() {
			return Array.from(dirtyRef.current);
		}

		return { schedule, flush, flushAll, discardPending, getDirtyNoteIds };
	}, [queryClient]);
}
