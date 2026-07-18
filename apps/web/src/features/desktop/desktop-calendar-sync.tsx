"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkspaceBackend } from "@/core/workspace-backend";
import { journalKeys } from "@/features/journal/hooks/journal-keys";
import {
	LOCAL_SYNC_DUE_MS,
	listLocalCalendarSubscriptions,
	syncLocalCalendarSubscription,
} from "@/features/journal/lib/local-calendar-subscriptions";

const CHECK_INTERVAL_MS = 60 * 60_000;

/** Desktop-only daily importer for saved external calendar subscription URLs. */
export function DesktopCalendarSync() {
	const backend = useWorkspaceBackend();
	const queryClient = useQueryClient();
	const running = useRef(false);

	useEffect(() => {
		if (backend.mode !== "tauri") return;
		let cancelled = false;

		const sync = async () => {
			if (running.current || !navigator.onLine) return;
			running.current = true;
			try {
				const now = Date.now();
				const due = listLocalCalendarSubscriptions().filter(
					(subscription) =>
						subscription.enabled &&
						(!subscription.lastSyncAt ||
							now - Date.parse(subscription.lastSyncAt) > LOCAL_SYNC_DUE_MS),
				);
				let imported = 0;
				for (const subscription of due) {
					if (cancelled) break;
					const outcome = await syncLocalCalendarSubscription(backend, subscription);
					imported += outcome.created + outcome.updated;
				}
				if (!cancelled && imported > 0) {
					await queryClient.invalidateQueries({ queryKey: journalKeys.all });
				}
			} finally {
				running.current = false;
			}
		};

		const initial = window.setTimeout(() => void sync(), 30_000);
		const interval = window.setInterval(() => void sync(), CHECK_INTERVAL_MS);
		return () => {
			cancelled = true;
			window.clearTimeout(initial);
			window.clearInterval(interval);
		};
	}, [backend, queryClient]);

	return null;
}
