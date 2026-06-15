"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/shared/lib/utils";
import { useNotifications } from "../hooks/use-notifications";
import type { TNotification } from "@/domain/collaboration/models";

export function NotificationBell() {
  const { notifications, unreadCount, markRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const handleNotificationClick = async (notification: TNotification) => {
    await markRead([notification.id]);
    setOpen(false);

    const payload = notification.payload as { noteId?: string };
    if (payload.noteId) {
      router.push(`/app?note=${payload.noteId}&inspector=collaborators`);
    }
  };

  const unread = notifications.filter((n) => !n.read);
  const labelMap: Record<string, string> = {
    collab_request: "requested to collaborate on",
    collab_accepted: "accepted your collaboration request on",
    collab_declined: "declined your collaboration request on",
    collab_revoked: "removed your access to",
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="relative inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-95"
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
      >
        <Bell className="h-4 w-4" strokeWidth={1.5} />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-2 w-2 items-center justify-center rounded-full bg-destructive" />
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1.5 w-80 overflow-hidden border border-border bg-popover text-popover-foreground shadow-lg">
            <div className="border-b border-border px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Notifications
              </p>
            </div>

            {notifications.length === 0 ? (
              <div className="px-3 py-6 text-center text-[13px] text-muted-foreground/60">
                No notifications
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto">
                {notifications.slice(0, 20).map((n) => {
                  const payload = n.payload as {
                    noteName?: string;
                    requesterName?: string;
                    permission?: string;
                  };
                  const label = labelMap[n.type] ?? n.type;
                  const actor =
                    n.type === "collab_request" ? payload.requesterName : "Someone";
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => void handleNotificationClick(n)}
                      className={cn(
                        "relative flex w-full flex-col gap-0.5 border-b border-border px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-muted",
                        !n.read && "bg-muted/40",
                      )}
                    >
                      <p className="text-[12px] leading-snug text-foreground/80">
                        <span className="font-medium">{actor}</span>{" "}
                        {label}{" "}
                        <span className="font-medium">&ldquo;{payload.noteName}&rdquo;</span>
                        {n.type === "collab_accepted" && payload.permission && (
                          <span className="text-muted-foreground"> as {payload.permission}</span>
                        )}
                      </p>
                      <p className="text-[10px] text-muted-foreground/55">
                        {new Date(n.createdAt).toLocaleDateString()}
                      </p>
                      {!n.read && (
                        <span className="absolute right-2 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-blue-500" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {unread.length > 0 && (
              <div className="border-t border-border px-3 py-2">
                <button
                  type="button"
                  onClick={() => void markRead(unread.map((n) => n.id))}
                  className="text-[11px] text-muted-foreground/70 transition-colors hover:text-foreground"
                >
                  Mark all as read
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
