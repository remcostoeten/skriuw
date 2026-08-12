"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
	deleteNotifications,
	getNotificationsAction,
	markNotificationsRead,
	markNotificationsUnread,
	respondToCollabRequestForNote,
} from "@/domain/collaboration/actions";
import type { TCollabPermission } from "@/domain/collaboration/models";
import { noop } from "@/shared/lib/noop";

export const notificationKeys = {
	all: ["notifications"] as const,
	list: () => [...notificationKeys.all, "list"] as const,
	unread: () => [...notificationKeys.all, "unread"] as const,
};

// One shared EventSource for the whole app. The bell can mount in more than one
// place (sidebar header + icon rail), and each mount calling `new EventSource`
// would open a separate streaming connection. Reference-count a single source.
let sharedSource: EventSource | null = null;
let sourceRefCount = 0;
let lastUnreadCount = 0;
// Guard against a dead session (e.g. logged-out tab) hammering the endpoint.
// The stream route returns 401 on no-auth, which the browser surfaces as an
// `onerror` without auto-reconnect — but a remount would otherwise reopen it.
// After MAX_STREAM_ERRORS consecutive failures we stop reopening; a healthy
// `onopen` resets the budget so transient network blips don't disable it.
const MAX_STREAM_ERRORS = 3;
let streamErrorCount = 0;
const unreadSubscribers = new Set<(count: number) => void>();

function openSharedSource(queryClient: QueryClient) {
	sourceRefCount += 1;
	if (sharedSource) return;
	if (streamErrorCount >= MAX_STREAM_ERRORS) return;

	const source = new EventSource("/api/notifications/stream");
	sharedSource = source;
	source.onopen = () => {
		streamErrorCount = 0;
	};
	source.onmessage = (event) => {
		try {
			const data = JSON.parse(event.data as string) as {
				type: string;
				unreadCount: number;
			};
			if (data.type === "init" || data.type === "update") {
				lastUnreadCount = data.unreadCount;
				unreadSubscribers.forEach((notify) => notify(lastUnreadCount));
				if (data.type === "update") {
					void queryClient.invalidateQueries({ queryKey: notificationKeys.list() });
				}
			}
		} catch {
			// ignore parse errors
			noop();
		}
	};
	source.onerror = () => {
		source.close();
		if (sharedSource === source) sharedSource = null;
		streamErrorCount += 1;
	};
}

function closeSharedSource() {
	sourceRefCount = Math.max(0, sourceRefCount - 1);
	if (sourceRefCount === 0 && sharedSource) {
		sharedSource.close();
		sharedSource = null;
	}
}

export function useNotifications() {
	const queryClient = useQueryClient();
	const query = useQuery({
		queryKey: notificationKeys.list(),
		queryFn: () => getNotificationsAction(),
		staleTime: 30_000,
		refetchInterval: 60_000,
	});

	const [unreadCount, setUnreadCount] = useState(
		query.data ? query.data.filter((n) => !n.read).length : lastUnreadCount,
	);

	// Subscribe to the shared real-time stream.
	useEffect(() => {
		const notify = (count: number) => setUnreadCount(count);
		unreadSubscribers.add(notify);
		openSharedSource(queryClient);
		return () => {
			unreadSubscribers.delete(notify);
			closeSharedSource();
		};
	}, [queryClient]);

	const refresh = () => queryClient.invalidateQueries({ queryKey: notificationKeys.list() });

	const markRead = async (ids: string[]) => {
		if (ids.length === 0) return;
		await markNotificationsRead(ids);
		await refresh();
	};

	const markUnread = async (ids: string[]) => {
		if (ids.length === 0) return;
		await markNotificationsUnread(ids);
		await refresh();
	};

	const remove = async (ids: string[]) => {
		if (ids.length === 0) return;
		await deleteNotifications(ids);
		await refresh();
	};

	const respondToRequest = async (
		noteId: string,
		requesterId: string,
		accept: boolean,
		permission: TCollabPermission = "viewer",
	) => {
		const result = await respondToCollabRequestForNote(noteId, requesterId, accept, permission);
		await refresh();
		return result;
	};

	return {
		notifications: query.data ?? [],
		unreadCount,
		isLoading: query.isLoading,
		markRead,
		markUnread,
		remove,
		respondToRequest,
	};
}
