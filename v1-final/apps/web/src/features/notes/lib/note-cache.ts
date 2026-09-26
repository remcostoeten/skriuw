"use client";

import type { QueryClient, QueryKey } from "@tanstack/react-query";
import {
	collectNoteLinkTargetIds,
	getNoteTitle,
	normalizeNoteTitle,
} from "@/domain/notes/note-links";
import { markdownToRichDocument } from "@/domain/notes/rich-document";
import { type UpdateNoteInput } from "@/domain/notes/actions";
import { applyNoteUpdate as applyNoteUpdateBuilder } from "@/core/workspace-backend/note-builders";
import type { NoteFile } from "@/types/notes";
import { notesKeys } from "./notes-keys";

export type SavedNoteResult = {
	note?: NoteFile;
	versionCreated: boolean;
	versionChanged?: boolean;
	versionId?: string | null;
};

export function applyNoteUpdate(note: NoteFile, input: UpdateNoteInput): NoteFile {
	return applyNoteUpdateBuilder(note, input, {
		resolveRichContent: (patch, current) =>
			patch.richContent ??
			(patch.content !== undefined
				? markdownToRichDocument(patch.content)
				: current.richContent),
	});
}

export function reconcileSavedNoteCache(
	queryClient: QueryClient,
	input: UpdateNoteInput,
	result: SavedNoteResult,
	options: { filesKey?: QueryKey; updateFiles?: boolean } = {},
): void {
	const { filesKey = notesKeys.files(), updateFiles = true } = options;

	if (result.note) {
		const previous = queryClient.getQueryData<NoteFile>(notesKeys.detail(result.note.id));
		if (updateFiles) {
			queryClient.setQueryData<NoteFile[]>(filesKey, (current = []) =>
				current.map((note) => (note.id === result.note!.id ? result.note! : note)),
			);
		}
		queryClient.setQueryData(notesKeys.detail(result.note.id), result.note);
		invalidateAffectedBacklinks(queryClient, previous, result.note, filesKey);
	} else {
		// Keep the detail view coherent even if the server didn't return a full note.
		queryClient.setQueryData<NoteFile | null>(notesKeys.detail(input.id), (current) =>
			current ? applyNoteUpdate(current, input) : current,
		);
	}

	if (result.versionChanged ?? result.versionCreated) {
		void queryClient.invalidateQueries({ queryKey: notesKeys.versions(input.id) });
	}
}

/**
 * Autosave-path backlinks invalidation, scoped to the notes an edit can
 * actually affect: the union of the note's link targets before and after the
 * save. A title change (explicit rename or heading-derived) can re-route
 * title links anywhere in the workspace, so that case — and a save with no
 * cached previous note to diff against — falls back to invalidating all
 * backlinks.
 */
function invalidateAffectedBacklinks(
	queryClient: QueryClient,
	previous: NoteFile | undefined,
	saved: NoteFile,
	filesKey: QueryKey,
): void {
	const titleChanged =
		!previous ||
		previous.name !== saved.name ||
		normalizeNoteTitle(getNoteTitle(previous)) !== normalizeNoteTitle(getNoteTitle(saved));

	if (titleChanged) {
		void queryClient.invalidateQueries({ queryKey: notesKeys.backlinksAll() });
		return;
	}

	const files = queryClient.getQueryData<NoteFile[]>(filesKey) ?? [];
	const affectedIds = new Set([
		...collectNoteLinkTargetIds(previous, files),
		...collectNoteLinkTargetIds(saved, files),
	]);

	for (const id of affectedIds) {
		void queryClient.invalidateQueries({ queryKey: notesKeys.backlinks(id) });
	}
}
