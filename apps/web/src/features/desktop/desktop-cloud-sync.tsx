"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkspaceBackend } from "@/core/workspace-backend";
import { getSyncClientConfig } from "@/domain/sync/sync-client-config";
import { syncDesktopWorkspace } from "@/domain/sync/sync-workspace";
import { notesKeys } from "@/features/notes/hooks/notes-keys";
import { journalKeys } from "@/features/journal/hooks/journal-keys";

const SYNC_INTERVAL_MS = 2 * 60_000;

/** Background sync exists only after the desktop user explicitly enabled it. */
export function DesktopCloudSync() {
	const backend = useWorkspaceBackend();
	const queryClient = useQueryClient();
	const running = useRef(false);

	useEffect(() => {
		if (backend.mode !== "tauri") return;
		let cancelled = false;

		const sync = async () => {
			const config = getSyncClientConfig();
			if (!config?.enabled || running.current || !navigator.onLine) return;
			running.current = true;
			try {
				await syncDesktopWorkspace(backend, config);
				if (!cancelled) {
					await queryClient.invalidateQueries({ queryKey: notesKeys.all });
					await queryClient.invalidateQueries({ queryKey: journalKeys.all });
				}
			} catch {
				// Local writes remain intact and the next interval/online event retries.
			} finally {
				running.current = false;
			}
		};

		const initial = window.setTimeout(() => void sync(), 15_000);
		const interval = window.setInterval(() => void sync(), SYNC_INTERVAL_MS);
		const onOnline = () => void sync();
		window.addEventListener("online", onOnline);
		return () => {
			cancelled = true;
			window.clearTimeout(initial);
			window.clearInterval(interval);
			window.removeEventListener("online", onOnline);
		};
	}, [backend, queryClient]);

	return null;
}
