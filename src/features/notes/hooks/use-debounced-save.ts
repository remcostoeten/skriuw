"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { type UpdateNoteInput, updateNote } from "@/domain/notes/api";
import { markdownToRichDocument } from "@/domain/notes/rich-document";
import type { NoteEditorMode, NoteFile, RichTextDocument } from "@/types/notes";
import { notesKeys } from "./use-notes";

type DebouncedUpdateOptions = {
	onSaving?: (noteId: string) => void;
	onSaved?: (noteId: string) => void;
	onError?: (noteId: string) => void;
};

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

const CONTENT_SAVE_DEBOUNCE_MS = 750;

export type DebouncedSaveController = {
	schedule(args: DebouncedContentArgs): void;
	flush(
		noteId: string,
		options?: { createCheckpoint?: boolean },
	): Promise<void>;
	flushAll(options?: { createCheckpoint?: boolean }): Promise<void>;
	getDirtyNoteIds(): string[];
};

export function useDebouncedSave(
	options: DebouncedUpdateOptions = {},
): DebouncedSaveController {
	const queryClient = useQueryClient();
	const timeoutsRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
	const versionsRef = useRef(new Map<string, number>());
	const pendingRef = useRef(new Map<string, PendingEdit>());
	const dirtyRef = useRef(new Set<string>());
	const optionsRef = useRef(options);

	useEffect(() => {
		optionsRef.current = options;
	}, [options]);

	useEffect(() => {
		return () => {
			for (const timeoutId of timeoutsRef.current.values()) {
				clearTimeout(timeoutId);
			}
			timeoutsRef.current.clear();
		};
	}, []);

	return useMemo<DebouncedSaveController>(() => {
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
		): Promise<void> {
			const requestVersion = (versionsRef.current.get(id) ?? 0) + 1;
			versionsRef.current.set(id, requestVersion);

			const input: UpdateNoteInput = {
				id,
				content: edit.content,
				richContent: edit.richContent,
				preferredEditorMode: edit.preferredEditorMode,
				createCheckpoint: createCheckpoint || undefined,
			};

			try {
				const result = await updateNote(input);
				if (!result.note || versionsRef.current.get(id) !== requestVersion) {
					return;
				}

				queryClient.setQueryData<NoteFile[]>(
					notesKeys.files(),
					(current = []) =>
						current.map((item) => (item.id === id ? result.note! : item)),
				);
				queryClient.setQueryData(notesKeys.detail(id), result.note);
				void queryClient.invalidateQueries({
					queryKey: notesKeys.backlinksAll(),
				});
				if (result.versionCreated) {
					void queryClient.invalidateQueries({
						queryKey: notesKeys.versions(id),
					});
				}
				optionsRef.current.onSaved?.(id);
			} catch {
				if (versionsRef.current.get(id) !== requestVersion) {
					return;
				}
				optionsRef.current.onError?.(id);
			}
		}

		function clearPending(id: string) {
			const timeoutId = timeoutsRef.current.get(id);
			if (timeoutId) {
				clearTimeout(timeoutId);
				timeoutsRef.current.delete(id);
			}
		}

		function schedule({
			id,
			content,
			richContent,
			preferredEditorMode,
		}: DebouncedContentArgs) {
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

			clearPending(id);
			const timeoutId = setTimeout(() => {
				timeoutsRef.current.delete(id);
				const pending = pendingRef.current.get(id);
				if (!pending) return;
				pendingRef.current.delete(id);
				void sendUpdate(id, pending, false);
			}, CONTENT_SAVE_DEBOUNCE_MS);

			timeoutsRef.current.set(id, timeoutId);
		}

		async function flush(
			noteId: string,
			flushOptions: { createCheckpoint?: boolean } = {},
		): Promise<void> {
			clearPending(noteId);
			const pending = pendingRef.current.get(noteId);
			const wantsCheckpoint = flushOptions.createCheckpoint ?? true;
			const wasDirty = dirtyRef.current.has(noteId);

			if (pending) {
				pendingRef.current.delete(noteId);
				if (wantsCheckpoint) dirtyRef.current.delete(noteId);
				await sendUpdate(noteId, pending, wantsCheckpoint);
				return;
			}

			if (wantsCheckpoint && wasDirty) {
				dirtyRef.current.delete(noteId);
				const snapshot = queryClient.getQueryData<NoteFile | null>(
					notesKeys.detail(noteId),
				);
				if (!snapshot) return;
				await sendUpdate(
					noteId,
					{
						content: snapshot.content,
						richContent: snapshot.richContent,
						preferredEditorMode: snapshot.preferredEditorMode,
					},
					true,
				);
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

		function getDirtyNoteIds() {
			return Array.from(dirtyRef.current);
		}

		return { schedule, flush, flushAll, getDirtyNoteIds };
	}, [queryClient]);
}
