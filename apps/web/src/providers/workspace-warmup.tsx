"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/core/auth/use-auth";
import { useWorkspaceBackend } from "@/core/workspace-backend";
import { useNotes } from "@/features/notes/hooks/use-notes";
import { notesKeys } from "@/features/notes/hooks/notes-keys";
import { useNotesStore } from "@/features/notes/store";
import { preloadRichTextEditor } from "@/features/editor/components/preload-rich-text-editor";
import { isGuestScopedId } from "@/domain/notes/note-id";
import type { NoteFile } from "@/domain/notes/models";

// Cap the background warm-up so a very large workspace doesn't fetch an unbounded
// payload on load. Beyond this, notes still load instantly once hovered or
// opened (hover-prefetch + staleTime: Infinity keep them cached thereafter).
const MAX_WARMUP_NOTES = 250;
const PRIORITY_WARMUP_NOTES = 8;
// Note bodies are fetched in a single batched server call per chunk (one DB
// `IN` query / one guest snapshot read) instead of one request per note, so the
// chunk can be large — this is about bounding payload size, not round-trips.
const BATCH_SIZE = 100;

function scheduleIdle(callback: () => void): () => void {
	if (typeof window === "undefined") return () => {};
	const w = window as typeof window & {
		requestIdleCallback?: (cb: IdleRequestCallback, opts?: IdleRequestOptions) => number;
		cancelIdleCallback?: (handle: number) => void;
	};
	if (w.requestIdleCallback) {
		const handle = w.requestIdleCallback(callback, { timeout: 2000 });
		return () => w.cancelIdleCallback?.(handle);
	}
	const t = window.setTimeout(callback, 400);
	return () => window.clearTimeout(t);
}

/**
 * Local-first warm-up. After the workspace is idle, pull every note's body into
 * the React Query cache so switching notes is instant — no fetch, no skeleton —
 * exactly like a synced local store. Already-cached notes (SSR-hydrated, the
 * active note, persisted-from-disk) are skipped, so this only fetches the gaps.
 */
export function WorkspaceWarmup() {
	const queryClient = useQueryClient();
	const auth = useAuth();
	const backend = useWorkspaceBackend();
	const notesQuery = useNotes();
	const files = notesQuery.data;
	const lastActiveFileId = useNotesStore((state) => state.lastActiveFileId);
	const recentFileIds = useNotesStore((state) => state.recentFileIds);

	// Kick the single most-likely-active note's body BEFORE the metadata list
	// resolves. `lastActiveFileId` comes from the persisted store, so it's known
	// on the first commit — well ahead of the `useNotes()` list query. On desktop
	// (no SSR body hydration) and on web when "remember last note" restores a note
	// other than the SSR-seeded first one, this is exactly the fetch the editor
	// skeleton waits on. Starting it here removes a serial round-trip, and because
	// it writes the shared `detail()` key, the eventual `useNote(activeFileId)`
	// dedupes onto this in-flight request instead of firing a second one.
	useEffect(() => {
		if (!auth.isReady) return;
		void preloadRichTextEditor().catch(() => {});
		if (!lastActiveFileId) return;
		if (backend.mode === "server" && isGuestScopedId(lastActiveFileId)) return;
		if (queryClient.getQueryData(notesKeys.detail(lastActiveFileId)) !== undefined) return;
		void queryClient.prefetchQuery({
			queryKey: notesKeys.detail(lastActiveFileId),
			queryFn: () => backend.getNote(lastActiveFileId),
			staleTime: Number.POSITIVE_INFINITY,
		});
	}, [auth.isReady, backend, lastActiveFileId, queryClient]);

	useEffect(() => {
		if (!auth.isReady) return;
		if (!files || files.length === 0) return;

		let cancelled = false;

		const cacheNotes = (notes: NoteFile[]) => {
			for (const note of notes) {
				queryClient.setQueryData(notesKeys.detail(note.id), note);
			}
		};
		const load = async (ids: string[]) => {
			if (ids.length === 0) return;
			const notes = await backend.getNotes(ids);
			if (!cancelled) cacheNotes(notes);
		};
		const knownIds = new Set(files.map((file) => file.id));
		const priorityIds = [lastActiveFileId, ...recentFileIds, files[0]?.id]
			.filter((id, index, ids): id is string => {
				if (!id || !knownIds.has(id)) return false;
				if (ids.indexOf(id) !== index) return false;
				if (queryClient.getQueryData(notesKeys.detail(id)) !== undefined) return false;
				return true;
			})
			.slice(0, PRIORITY_WARMUP_NOTES);

		let cancelIdle = () => {};
		void load(priorityIds).finally(() => {
			if (cancelled) return;
			cancelIdle = scheduleIdle(() => {
				const pending = files
					.flatMap((file) =>
						queryClient.getQueryData(notesKeys.detail(file.id)) === undefined
							? [file.id]
							: [],
					)
					.slice(0, MAX_WARMUP_NOTES);
				const chunks: string[][] = [];
				for (let i = 0; i < pending.length; i += BATCH_SIZE) {
					chunks.push(pending.slice(i, i + BATCH_SIZE));
				}
				void Promise.all(chunks.map(load));
			});
		});

		return () => {
			cancelled = true;
			cancelIdle();
		};
	}, [auth.isReady, backend, files, lastActiveFileId, queryClient, recentFileIds]);

	return null;
}
