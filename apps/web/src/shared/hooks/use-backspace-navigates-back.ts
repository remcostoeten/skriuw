"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { updateNoteUrl } from "@/features/notes/hooks/use-notes-navigation";
import { useNotesStore } from "@/features/notes/store";

function isEditableTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	if (target.isContentEditable) return true;
	const tag = target.tagName;
	return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/**
 * Lets Backspace act as browser-back on read-only detail pages (person/tag
 * insights) reached by clicking a mention chip, mirroring the chip's own
 * router.push so the same key returns to the note it was clicked from.
 */
export function useBackspaceNavigatesBack() {
	const router = useRouter();

	useEffect(() => {
		function handleKeyDown(event: KeyboardEvent) {
			if (event.key !== "Backspace") return;
			if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
			if (isEditableTarget(event.target)) return;

			event.preventDefault();
			router.back();
		}

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [router]);
}

/**
 * Lets Backspace jump back to the note a wikilink chip was clicked from,
 * mirroring useBackspaceNavigatesBack for note-to-note navigation (which
 * swaps activeFileId in place rather than pushing a distinct route, so
 * router.back() can't be used here).
 */
export function useNoteLinkBackspaceNavigatesBack() {
	useEffect(() => {
		function handleKeyDown(event: KeyboardEvent) {
			if (event.key !== "Backspace") return;
			if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
			if (isEditableTarget(event.target)) return;

			const { noteLinkReturn, activeFileId, setActiveFileId, setNoteLinkReturn } =
				useNotesStore.getState();
			if (!noteLinkReturn || noteLinkReturn.toId !== activeFileId) return;

			event.preventDefault();
			setNoteLinkReturn(null);
			setActiveFileId(noteLinkReturn.fromId);
			updateNoteUrl(noteLinkReturn.fromId, { mode: "replace" });
		}

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, []);
}
