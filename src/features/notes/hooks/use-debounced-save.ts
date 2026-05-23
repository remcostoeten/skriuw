"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { type UpdateNoteInput, updateNote } from "@/domain/notes/actions";
import { markdownToRichDocument } from "@/domain/notes/rich-document";
import type { NoteEditorMode, NoteFile, RichTextDocument } from "@/types/notes";
import { notesKeys } from "./notes-keys";
import { reconcileSavedNoteCache } from "@/features/notes/lib/note-cache";

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
	const versionsRef = useRef(new Map<string, number>());
	const sessionVersionIdsRef = useRef(new Map<string, string>());
	const flushQueuesRef = useRef(new Map<string, Promise<void>>());
	const pendingRef = useRef(new Map<string, PendingEdit>());
	const dirtyRef = useRef(new Set<string>());
	const optionsRef = useRef(options);

	useEffect(() => {
		optionsRef.current = options;
	}, [options]);

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
				sessionVersionId: createCheckpoint
					? sessionVersionIdsRef.current.get(id)
					: undefined,
			};

			try {
				const result = await updateNote(input);
				if (!result.note || versionsRef.current.get(id) !== requestVersion) {
					return;
				}
				if (createCheckpoint && result.versionId) {
					sessionVersionIdsRef.current.set(id, result.versionId);
				}
				reconcileSavedNoteCache(queryClient, input, result);
				optionsRef.current.onSaved?.(id);
			} catch {
				if (versionsRef.current.get(id) !== requestVersion) {
					return;
				}
				optionsRef.current.onError?.(id);
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
		}

		async function flushNow(
			noteId: string,
			flushOptions: { createCheckpoint?: boolean } = {},
		): Promise<void> {
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

		function getDirtyNoteIds() {
			return Array.from(dirtyRef.current);
		}

		return { schedule, flush, flushAll, getDirtyNoteIds };
	}, [queryClient]);
}
