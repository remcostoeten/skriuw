"use client";

import dynamic from "next/dynamic";
import { useMemo, useRef, type ReactNode } from "react";
import { resolveEditorMode } from "@/features/editor/lib/editor-mode";
import { useNote } from "@/features/notes/hooks/use-note";
import type { NoteFile, NoteVersion } from "@/types/notes";
import { NotesMetadataPlaceholder } from "./metadata-placeholder";

const MetadataPanel = dynamic(
	() => import("./metadata-panel").then((mod) => ({ default: mod.MetadataPanel })),
	{ ssr: false, loading: () => <NotesMetadataPlaceholder /> },
);

type Props = {
	focusedFileId: string | null;
	metadataFiles: NoteFile[];
	defaultModeRaw: boolean;
	isEditorReady: boolean;
	isMobile?: boolean;
	className?: string;
	placeholder: ReactNode;
	toggleEditorModeFor: (file: NoteFile | null, mode: "raw" | "block" | null) => void;
	onFileSelect?: (id: string) => void;
	onViewVersion?: (version: NoteVersion) => void;
	onShare?: (noteId: string) => void;
	onRequestClose?: () => void;
};

function mergeNote(files: NoteFile[], note: NoteFile | null): NoteFile[] {
	if (!note) return files;
	let found = false;
	const next = files.map((file) => {
		if (file.id !== note.id) return file;
		found = true;
		return note;
	});
	return found ? next : [...next, note];
}

export function MetadataPanelHost({
	focusedFileId,
	metadataFiles,
	defaultModeRaw,
	isEditorReady,
	isMobile = false,
	className,
	placeholder,
	toggleEditorModeFor,
	onFileSelect,
	onViewVersion,
	onShare,
	onRequestClose,
}: Props) {
	const noteQuery = useNote(focusedFileId ?? "");
	const focusedNote = noteQuery.isPlaceholderData ? null : (noteQuery.data ?? null);

	const files = useMemo(
		() => mergeNote(metadataFiles, focusedNote),
		[metadataFiles, focusedNote],
	);

	const isFocusedNoteLoading =
		Boolean(focusedFileId) &&
		metadataFiles.some((file) => file.id === focusedFileId) &&
		!focusedNote;

	const lastLoadedFileRef = useRef(focusedNote);
	if (focusedNote) {
		lastLoadedFileRef.current = focusedNote;
	}
	const isSwappingNote =
		isFocusedNoteLoading && isEditorReady && lastLoadedFileRef.current !== null;
	const displayFile = focusedNote ?? (isSwappingNote ? lastLoadedFileRef.current : null);
	const showContentSkeleton = (isFocusedNoteLoading || !isEditorReady) && !displayFile;

	const editorMode = displayFile
		? resolveEditorMode(displayFile, defaultModeRaw ? "raw" : "block", !isMobile)
		: "block";

	if (showContentSkeleton) {
		return <>{placeholder}</>;
	}

	return (
		<MetadataPanel
			file={displayFile}
			files={files}
			isMobile={isMobile}
			editorMode={editorMode}
			onToggleEditorMode={() => toggleEditorModeFor(displayFile, editorMode)}
			onFileSelect={onFileSelect}
			onViewVersion={onViewVersion}
			onShare={onShare}
			onRequestClose={onRequestClose}
			className={className}
		/>
	);
}
