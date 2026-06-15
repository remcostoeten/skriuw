"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getNotificationsAction, markNotificationsRead } from "@/domain/collaboration/actions";

export const notificationKeys = {
  all: ["notifications"] as const,
  list: () => [...notificationKeys.all, "list"] as const,
  unread: () => [...notificationKeys.all, "unread"] as const,
};

export function useNotifications() {
  const queryClient = useQueryClient();
  const [unreadCount, setUnreadCount] = useState(0);

  const query = useQuery({
    queryKey: notificationKeys.list(),
    queryFn: () => getNotificationsAction(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // SSE for real-time push
  useEffect(() => {
    const es = new EventSource("/api/notifications/stream");

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as { type: string; unreadCount: number };
        if (data.type === "init" || data.type === "update") {
          setUnreadCount(data.unreadCount);
          if (data.type === "update") {
            void queryClient.invalidateQueries({ queryKey: notificationKeys.list() });
          }
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      es.close();
    };

    return () => es.close();
  }, [queryClient]);

  // Sync unread count from query data
  useEffect(() => {
    if (query.data) {
      setUnreadCount(query.data.filter((n) => !n.read).length);
    }
  }, [query.data]);

  const markRead = async (ids: string[]) => {
    await markNotificationsRead(ids);
    await queryClient.invalidateQueries({ queryKey: notificationKeys.list() });
    setUnreadCount(0);
  };

  return { notifications: query.data ?? [], unreadCount, markRead, isLoading: query.isLoading };
}
