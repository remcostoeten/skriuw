"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/core/auth/use-auth";
import { useWorkspaceBackend } from "@/core/workspace-backend";
import { useNotes } from "@/features/notes/hooks/use-notes";
import { notesKeys } from "@/features/notes/hooks/notes-keys";
import type { NoteFile } from "@/domain/notes/models";

// Cap the background warm-up so a very large workspace doesn't fetch an unbounded
// payload on load. Beyond this, notes still load instantly once hovered or
// opened (hover-prefetch + staleTime: Infinity keep them cached thereafter).
const MAX_WARMUP_NOTES = 250;
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

	useEffect(() => {
		if (!auth.isReady) return;
		if (!files || files.length === 0) return;

		let cancelled = false;

		const pending = files
			.map((file) => file.id)
			.filter((id) => id && queryClient.getQueryData(notesKeys.detail(id)) === undefined)
			.slice(0, MAX_WARMUP_NOTES);

		const cancelIdle = scheduleIdle(() => {
			// Warm the lazy BlockNote editor chunk so the first note opened in the
			// session doesn't wait on the ~1.3 MiB script download. Runs regardless
			// of whether note bodies still need fetching. Failures are ignored — it
			// just falls back to loading on first mount.
			void import("@/features/editor/components/rich-text-editor").catch(() => {});

			void (async () => {
				for (let i = 0; i < pending.length; i += BATCH_SIZE) {
					if (cancelled) return;
					const batch = pending.slice(i, i + BATCH_SIZE);
					// One batched fetch for the whole chunk instead of N round-trips.
					// Routed through the active workspace backend (server / local /
					// tauri) so desktop never reaches the cloud server actions.
					const notes: NoteFile[] = await backend.getNotes(batch);
					if (cancelled) return;
					// Seed each returned body straight into the detail cache so
					// useNote() reads it instantly with no fetch and no skeleton.
					for (const note of notes) {
						queryClient.setQueryData(notesKeys.detail(note.id), note);
					}
				}
			})();
		});

		return () => {
			cancelled = true;
			cancelIdle();
		};
	}, [auth.isReady, files, backend, queryClient]);

	return null;
}
