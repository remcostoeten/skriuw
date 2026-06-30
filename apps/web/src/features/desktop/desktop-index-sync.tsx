"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { isTauriRuntime, tauriInvoke } from "@/core/workspace-backend/tauri-backend";
import { notesKeys } from "@/features/notes/lib/notes-keys";

type TauriEventApi = {
	listen: (event: string, handler: (event: { payload: unknown }) => void) => Promise<() => void>;
};

type TauriGlobal = { __TAURI__?: { event?: TauriEventApi } };

const RECONCILE_EVENT = "index://reconciled";

/**
 * Desktop-only. The Rust shell defers reconciling the SQLite index against the
 * on-disk vault to a background thread on launch, so the first `list_notes`
 * query can resolve against a stale (or empty) index and — with the notes query
 * holding `staleTime: Infinity` — cache that empty result forever, leaving the
 * sidebar stuck on "No files yet" until the next mutation. This invalidates the
 * notes caches once the reconcile finishes: it listens for `index://reconciled`
 * and only then checks `index_ready`. Checking the flag *after* the listener is
 * attached closes the race where the reconcile completes in the gap between the
 * mount-time poll and the listener registration — otherwise both can miss and
 * the empty index caches forever. Invalidation runs at most once. No-ops in the
 * web build, where the event never fires and the command is absent.
 */
export function DesktopIndexSync(): null {
	const queryClient = useQueryClient();

	useEffect(() => {
		if (!isTauriRuntime()) return;

		let unlisten: (() => void) | undefined;
		let cancelled = false;
		let invalidated = false;

		function invalidate() {
			if (cancelled || invalidated) return;
			invalidated = true;
			unlisten?.();
			unlisten = undefined;
			void queryClient.invalidateQueries({ queryKey: notesKeys.all });
		}

		function pollReady() {
			void tauriInvoke<boolean>("index_ready").then((ready) => {
				if (ready) invalidate();
			});
		}

		const events = (window as unknown as TauriGlobal).__TAURI__?.event;
		if (events) {
			void events.listen(RECONCILE_EVENT, () => invalidate()).then((stop) => {
				if (cancelled || invalidated) {
					stop();
					return;
				}
				unlisten = stop;
				pollReady();
			});
		} else {
			pollReady();
		}

		return () => {
			cancelled = true;
			unlisten?.();
		};
	}, [queryClient]);

	return null;
}
