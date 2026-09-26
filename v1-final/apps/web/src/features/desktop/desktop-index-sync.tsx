"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
	backfillMissingNoteLinks,
	isTauriRuntime,
	tauriInvoke,
} from "@/core/workspace-backend/tauri-backend";
import { notesKeys } from "@/features/notes/lib/notes-keys";
import { peopleKeys } from "@/features/people/lib/people-keys";
import { tagsKeys } from "@/features/tags/lib/tags-keys";
import { usePreferencesStore } from "@/features/settings/store";
import { noop } from "@/shared/lib/noop";

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

			// The reconcile adopts imported/externally-edited notes into the
			// index without link rows; index them now. Backlinks, the graph,
			// and the tag/person aggregations all read the persisted rows.
			void backfillMissingNoteLinks()
				.then((indexed) => {
					if (indexed > 0) {
						void queryClient.invalidateQueries({
							queryKey: notesKeys.backlinksAll(),
						});
						void queryClient.invalidateQueries({ queryKey: notesKeys.graph() });
						void queryClient.invalidateQueries({ queryKey: tagsKeys.all });
						void queryClient.invalidateQueries({ queryKey: peopleKeys.all });
					}
				})
				.catch(noop);
		}

		function pollReady() {
			void tauriInvoke<boolean>("index_ready").then((ready) => {
				if (ready) invalidate();
			});
		}

		const events = (window as unknown as TauriGlobal).__TAURI__?.event;
		if (events) {
			void events
				.listen(RECONCILE_EVENT, () => invalidate())
				.then((stop) => {
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

	// The tag-detection preference is applied at link-extraction time, so its
	// effect is baked into the persisted note_links rows. Flipping it would
	// otherwise only affect notes saved afterwards — rebuild the whole index so
	// the tags page / graph reflect the new setting immediately.
	useEffect(() => {
		if (!isTauriRuntime()) return;

		let previous = usePreferencesStore.getState().editor.detectTagsInText;
		return usePreferencesStore.subscribe((state) => {
			const current = state.editor.detectTagsInText;
			if (current === previous) return;
			previous = current;
			void tauriInvoke("clear_note_links_index")
				.then(() => backfillMissingNoteLinks())
				.then(() => {
					void queryClient.invalidateQueries({ queryKey: notesKeys.backlinksAll() });
					void queryClient.invalidateQueries({ queryKey: notesKeys.graph() });
					void queryClient.invalidateQueries({ queryKey: tagsKeys.all });
					void queryClient.invalidateQueries({ queryKey: peopleKeys.all });
				})
				.catch(noop);
		});
	}, [queryClient]);

	return null;
}
