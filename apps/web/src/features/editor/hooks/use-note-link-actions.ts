"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { findFirstNoteByTitle, normalizeNoteTitle } from "@/domain/notes/note-links";
import { useCreateNote } from "@/features/notes/hooks/use-create-note";
import { updateNoteUrl } from "@/features/notes/hooks/use-notes-navigation";
import { useNotesStore } from "@/features/notes/store";
import { useLazyRef } from "@/shared/lib/use-lazy-ref";
import type { NoteFile } from "@/types/notes";
import { useNoteLinkContext } from "@/features/editor/components/inline-specs/note-link-context";

function buildNoteCreateInput(title: string) {
	const trimmed = title.trim();
	const noteName = trimmed.endsWith(".md") ? trimmed : `${trimmed}.md`;

	return {
		name: noteName,
		content: `# ${trimmed}\n\n`,
	};
}

export function useNoteLinkActions(filesOverride?: NoteFile[]) {
	const router = useRouter();
	const { files: contextFiles, activeFileId: contextActiveFileId } = useNoteLinkContext();
	const files = filesOverride ?? contextFiles;
	const setActiveFileId = useNotesStore((state) => state.setActiveFileId);
	const openTabInBackground = useNotesStore((state) => state.openTabInBackground);
	const secondaryFileId = useNotesStore((state) => state.split.secondaryFileId);
	const createNote = useCreateNote();
	const pendingTitlesRef = useLazyRef(() => new Set<string>());
	const [creatingTitleKey, setCreatingTitleKey] = useState<string | null>(null);

	const openNote = useCallback(
		(noteId: string) => {
			setActiveFileId(noteId);

			if (
				typeof window !== "undefined" &&
				window.location.pathname.startsWith("/app/journal")
			) {
				router.push(`/app?note=${encodeURIComponent(noteId)}`);
				return;
			}

			updateNoteUrl(noteId);
		},
		[router, setActiveFileId],
	);

	const openNoteInNewTab = useCallback(
		(noteId: string) => {
			const pane =
				contextActiveFileId && contextActiveFileId === secondaryFileId
					? "secondary"
					: "primary";
			openTabInBackground(pane, noteId);
		},
		[contextActiveFileId, openTabInBackground, secondaryFileId],
	);

	const createAndOpenNote = useCallback(
		(title: string) => {
			const trimmed = title.trim();
			if (!trimmed) return;

			// Open ANY existing match — including when the title is ambiguous
			// (duplicates already exist). Creating here would add a third
			// duplicate and keep the link permanently ambiguous.
			const existing = findFirstNoteByTitle(files, trimmed);
			if (existing) {
				openNote(existing.id);
				return;
			}

			const pendingKey = normalizeNoteTitle(trimmed);
			if (pendingTitlesRef.current.has(pendingKey)) {
				return;
			}

			pendingTitlesRef.current.add(pendingKey);
			setCreatingTitleKey(pendingKey);
			createNote.mutate(buildNoteCreateInput(trimmed), {
				onSuccess: (note) => {
					openNote(note.id);
				},
				onSettled: () => {
					pendingTitlesRef.current.delete(pendingKey);
					setCreatingTitleKey((current) => (current === pendingKey ? null : current));
				},
			});
		},
		[createNote, files, openNote],
	);

	const isCreatingTitle = useCallback(
		(title: string) => creatingTitleKey === normalizeNoteTitle(title.trim()),
		[creatingTitleKey],
	);

	return {
		openNote,
		openNoteInNewTab,
		createAndOpenNote,
		isCreatingTitle,
	};
}
