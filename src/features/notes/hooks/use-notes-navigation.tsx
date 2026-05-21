"use client";

import { useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import type { NoteFile } from "@/types/notes";

export type NoteUrlSyncMode = "push" | "replace";

export type NoteUrlSyncOptions = {
	mode?: NoteUrlSyncMode;
};

type FileSelectHandler = (id: string, options?: NoteUrlSyncOptions) => void;

export function useFileNavigation(files: NoteFile[], activeFileId: string | null) {
	const currentFileIndex = files.findIndex((file) => file.id === activeFileId);
	const canNavigatePrev = currentFileIndex > 0;
	const canNavigateNext = currentFileIndex < files.length - 1;

	const navigatePrev = useCallback(
		(onFileSelect: FileSelectHandler) => {
			if (canNavigatePrev) {
				const prevFile = files[currentFileIndex - 1];
				onFileSelect(prevFile.id);
			}
		},
		[canNavigatePrev, currentFileIndex, files],
	);

	const navigateNext = useCallback(
		(onFileSelect: FileSelectHandler) => {
			if (canNavigateNext) {
				const nextFile = files[currentFileIndex + 1];
				onFileSelect(nextFile.id);
			}
		},
		[canNavigateNext, currentFileIndex, files],
	);

	return {
		currentFileIndex,
		canNavigatePrev,
		canNavigateNext,
		navigatePrev,
		navigateNext,
	};
}

export function useUrlSync(onFileSelect: (id: string) => void) {
	const searchParams = useSearchParams();

	const syncWithUrl = useCallback((noteId: string, options?: NoteUrlSyncOptions) => {
		return updateNoteUrl(noteId, options);
	}, []);

	const handleFileSelect = useCallback(
		(id: string, options?: NoteUrlSyncOptions) => {
			onFileSelect(id);
			syncWithUrl(id, options);
		},
		[onFileSelect, syncWithUrl],
	);

	useEffect(() => {
		const noteId = searchParams.get("note");
		if (noteId) {
			onFileSelect(noteId);
		}
	}, [searchParams, onFileSelect]);

	return { handleFileSelect, syncWithUrl };
}

export function updateNoteUrl(noteId: string, options?: NoteUrlSyncOptions) {
	if (typeof window === "undefined") {
		return false;
	}

	const nextUrl = buildNoteUrl(noteId);
	const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;

	if (nextUrl === currentUrl) {
		return false;
	}

	const mode = options?.mode ?? "push";
	window.history[mode === "replace" ? "replaceState" : "pushState"]({}, "", nextUrl);

	return true;
}

export function clearNoteUrl(options?: NoteUrlSyncOptions) {
	if (typeof window === "undefined") {
		return false;
	}

	const url = new URL(window.location.href);
	if (!url.searchParams.has("note")) {
		return false;
	}

	url.searchParams.delete("note");
	const nextUrl = `${url.pathname}${url.search}${url.hash}`;
	const mode = options?.mode ?? "replace";
	window.history[mode === "replace" ? "replaceState" : "pushState"]({}, "", nextUrl);

	return true;
}

export function buildNoteUrl(noteId: string, href = window.location.href) {
	const url = new URL(href);
	url.searchParams.set("note", noteId);
	return `${url.pathname}${url.search}${url.hash}`;
}
