"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
	isTauriRuntime,
	preserveVaultConflictCopy,
	tauriInvoke,
} from "@/core/workspace-backend/tauri-backend";
import type { NoteFile } from "@/domain/notes/models";
import { journalKeys } from "@/features/journal/hooks/journal-keys";
import { notesKeys } from "@/features/notes/lib/notes-keys";
import { useNotesStore } from "@/features/notes/store";
import { peopleKeys } from "@/features/people/lib/people-keys";
import { tagsKeys } from "@/features/tags/lib/tags-keys";
import { showUserToast } from "@/shared/lib/user-toast";

type VaultChangeEvent = {
	generation: number;
	changedNoteIds: string[];
	deletedNoteIds: string[];
	addedNoteIds: string[];
	foldersChanged: boolean;
	journalsChanged: boolean;
	tagsChanged: boolean;
	coversChanged: boolean;
	fullRescan: boolean;
	warnings: string[];
};

type TauriEventApi = {
	listen: <T>(event: string, handler: (event: { payload: T }) => void) => Promise<() => void>;
};

type TauriGlobal = { __TAURI__?: { event?: TauriEventApi } };

const PROTECTED_STATES = new Set(["saving", "error", "conflict"]);
const recoveredDeletedNotes = new Set<string>();

/**
 * Applies native vault watcher summaries to narrow React Query families.
 * Active editors are only replaced when clean. A dirty/saving/error editor is
 * left mounted and moved to a persistent conflict state instead.
 */
export function DesktopVaultSync(): null {
	const queryClient = useQueryClient();

	useEffect(() => {
		if (!isTauriRuntime()) return;
		const events = (window as unknown as TauriGlobal).__TAURI__?.event;
		if (!events) return;

		let cancelled = false;
		let unlisten: (() => void) | undefined;
		void events
			.listen<VaultChangeEvent>("vault://changed", ({ payload }) => {
				if (cancelled) return;
				const state = useNotesStore.getState();
				const activeIds = new Set(
					[state.activeFileId, state.split.secondaryFileId].filter(Boolean),
				);
				const touched = [
					...payload.changedNoteIds,
					...payload.addedNoteIds,
					...payload.deletedNoteIds,
				];

				if (payload.fullRescan) {
					void queryClient.invalidateQueries({ queryKey: notesKeys.all });
				} else if (touched.length > 0) {
					void queryClient.invalidateQueries({ queryKey: notesKeys.files() });
					for (const id of touched) {
						const isProtected =
							activeIds.has(id) && PROTECTED_STATES.has(state.getFileSaveState(id));
						if (isProtected) {
							state.setFileSaveState(id, "conflict");
							const draft = queryClient.getQueryData<NoteFile | null>(
								notesKeys.detail(id),
							);
							const isDeleted = payload.deletedNoteIds.includes(id);
							if (draft && (!isDeleted || !recoveredDeletedNotes.has(id))) {
								if (isDeleted) recoveredDeletedNotes.add(id);
								void preserveVaultConflictCopy(draft)
									.then(() => {
										void queryClient.invalidateQueries({
											queryKey: notesKeys.files(),
										});
										if (isDeleted) {
											showUserToast(
												"Deleted disk note recovered as a conflict copy",
												"info",
											);
										}
									})
									.catch(() => {
										if (isDeleted) recoveredDeletedNotes.delete(id);
										showUserToast(
											"Could not save the deleted note recovery copy",
											"error",
										);
									});
							}
							continue;
						}
						if (payload.deletedNoteIds.includes(id)) {
							queryClient.removeQueries({
								queryKey: notesKeys.detail(id),
								exact: true,
							});
						} else {
							void queryClient.invalidateQueries({
								queryKey: notesKeys.detail(id),
								exact: true,
							});
						}
					}
					void queryClient.invalidateQueries({ queryKey: notesKeys.backlinksAll() });
					void queryClient.invalidateQueries({ queryKey: notesKeys.graph() });
					void queryClient.invalidateQueries({ queryKey: tagsKeys.all });
					void queryClient.invalidateQueries({ queryKey: peopleKeys.all });
				}
				if (payload.foldersChanged) {
					void queryClient.invalidateQueries({ queryKey: notesKeys.folders() });
				}
				if (payload.journalsChanged || payload.tagsChanged) {
					void queryClient.invalidateQueries({ queryKey: journalKeys.all });
				}
				if (payload.warnings.length > 0) {
					showUserToast(
						payload.warnings[0] ?? "A vault file could not be reconciled",
						"error",
					);
				} else if (payload.changedNoteIds.some((id) => activeIds.has(id))) {
					showUserToast("Updated from disk", "info");
				}
			})
			.then((stop) => {
				if (cancelled) stop();
				else unlisten = stop;
			});

		// Subscribe before polling: this closes the startup race with the Rust
		// watcher exactly as DesktopIndexSync does for initial reconciliation.
		void tauriInvoke<{ state: string; message?: string }>("vault_watcher_status").then(
			(status) => {
				if (!cancelled && status.state === "degraded") {
					showUserToast(
						status.message ?? "Vault watching needs to be restarted",
						"error",
					);
				}
			},
		);

		return () => {
			cancelled = true;
			unlisten?.();
		};
	}, [queryClient]);

	return null;
}
