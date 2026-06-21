"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Bell,
  Check,
  CheckCheck,
  ExternalLink,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { showUserToast } from "@/shared/lib/user-toast";
import { cn } from "@/shared/lib/utils";
import { useNotifications } from "../hooks/use-notifications";
import type { TCollabPermission, TNotification } from "@/domain/collaboration/models";

type NotificationPayload = {
  noteId?: string;
  noteName?: string;
  requesterId?: string;
  requesterName?: string;
  permission?: string;
};

const LABELS: Record<TNotification["type"], string> = {
  collab_request: "requested to collaborate on",
  collab_accepted: "accepted your collaboration request on",
  collab_declined: "declined your collaboration request on",
  collab_revoked: "removed your access to",
};

function IconAction({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40",
        danger && "hover:bg-destructive/10 hover:text-destructive",
      )}
    >
      {children}
    </button>
  );
}

function NotificationRow({
  n,
  onOpen,
  onToggleRead,
  onDelete,
  onRespond,
  busy,
}: {
  n: TNotification;
  onOpen: (n: TNotification) => void;
  onToggleRead: (n: TNotification) => void;
  onDelete: (n: TNotification) => void;
  onRespond: (n: TNotification, accept: boolean, permission?: TCollabPermission) => void;
  busy: boolean;
}) {
  const payload = n.payload as NotificationPayload;
  const actor = n.type === "collab_request" ? payload.requesterName : undefined;
  const isRequest = n.type === "collab_request";

  return (
    <div
      className={cn(
        "group relative flex flex-col gap-1.5 border-b border-border px-3 py-2.5 transition-colors last:border-0",
        !n.read && "bg-muted/40",
      )}
    >
      <div className="flex items-start gap-2">
        {!n.read && (
          <span
            aria-hidden
            className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500"
          />
        )}
        <p
          className={cn(
            "min-w-0 flex-1 text-[12px] leading-snug text-foreground/80",
            n.read && "pl-3.5",
          )}
        >
          {actor && <span className="font-medium">{actor} </span>}
          {LABELS[n.type] ?? n.type}{" "}
          <span className="font-medium">&ldquo;{payload.noteName}&rdquo;</span>
          {n.type === "collab_accepted" && payload.permission && (
            <span className="text-muted-foreground"> as {payload.permission}</span>
          )}
        </p>
      </div>

      <div className="flex items-center justify-between gap-2 pl-3.5">
        <span className="text-[10px] text-muted-foreground/55">
          {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
        </span>

        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          {payload.noteId && (
            <IconAction label="Open note" onClick={() => onOpen(n)}>
              <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.6} />
            </IconAction>
          )}
          <IconAction
            label={n.read ? "Mark as unread" : "Mark as read"}
            onClick={() => onToggleRead(n)}
          >
            {n.read ? (
              <Undo2 className="h-3.5 w-3.5" strokeWidth={1.6} />
            ) : (
              <Check className="h-3.5 w-3.5" strokeWidth={1.6} />
            )}
          </IconAction>
          <IconAction label="Delete" danger onClick={() => onDelete(n)}>
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.6} />
          </IconAction>
        </div>
      </div>

      {isRequest && (
        <div className="flex items-center gap-1.5 pl-3.5 pt-0.5">
          {/* Accepting a collaboration request grants edit access — a
              collaborator IS an editor. Read-only "viewer" access comes from
              the public share link, not from this flow. */}
          <button
            type="button"
            disabled={busy}
            onClick={() => onRespond(n, true, "editor")}
            className="inline-flex h-6 items-center gap-1 rounded-md bg-foreground px-2 text-[11px] font-medium text-background transition-opacity hover:opacity-85 disabled:opacity-50"
          >
            <Check className="h-3 w-3" strokeWidth={2} />
            Accept
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onRespond(n, false)}
            className="inline-flex h-6 items-center gap-1 rounded-md border border-border px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:border-destructive hover:text-destructive disabled:opacity-50"
          >
            <X className="h-3 w-3" strokeWidth={1.75} />
            Decline
          </button>
        </div>
      )}
    </div>
  );
}

export function NotificationBell({
  variant = "sidebar",
}: {
  variant?: "sidebar" | "rail";
}) {
  const { notifications, unreadCount, markRead, markUnread, remove, respondToRequest } =
    useNotifications();
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const router = useRouter();

  const unread = notifications.filter((n) => !n.read);

  const handleOpen = (n: TNotification) => {
    void markRead([n.id]);
    setOpen(false);
    const payload = n.payload as NotificationPayload;
    if (payload.noteId) {
      const inspector = n.type === "collab_request" ? "&inspector=collaborators" : "";
      router.push(`/app?note=${payload.noteId}${inspector}`);
    }
  };

  const handleToggleRead = (n: TNotification) => {
    void (n.read ? markUnread([n.id]) : markRead([n.id]));
  };

  const handleRespond = async (
    n: TNotification,
    accept: boolean,
    permission: TCollabPermission = "editor",
  ) => {
    const payload = n.payload as NotificationPayload;
    if (!payload.noteId || !payload.requesterId) return;
    setBusyId(n.id);
    try {
      const result = await respondToRequest(
        payload.noteId,
        payload.requesterId,
        accept,
        permission,
      );
      if (result.ok) {
        showUserToast(accept ? "Collaborator added" : "Request declined", "success");
        await markRead([n.id]);
      } else {
        showUserToast(result.error ?? "Couldn't respond", "error");
      }
    } catch {
      showUserToast("Couldn't respond to request", "error");
    } finally {
      setBusyId(null);
    }
  };

  const triggerClass =
    variant === "rail"
      ? "pressable relative flex h-9 w-9 items-center justify-center rounded-full border border-sidebar-border bg-sidebar text-sidebar-foreground/78 transition-colors hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
      : "relative inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-95";

  const iconSize = variant === "rail" ? "h-4 w-4" : "h-4 w-4";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={triggerClass}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
      >
        <Bell className={iconSize} strokeWidth={1.5} />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-semibold leading-none text-destructive-foreground tabular-nums">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </PopoverTrigger>

      <PopoverContent
        align={variant === "rail" ? "start" : "end"}
        side={variant === "rail" ? "right" : "bottom"}
        sideOffset={8}
        className="w-80 p-0"
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Notifications
          </p>
          {unread.length > 0 && (
            <button
              type="button"
              onClick={() => void markRead(unread.map((n) => n.id))}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/70 transition-colors hover:text-foreground"
            >
              <CheckCheck className="h-3 w-3" strokeWidth={1.6} />
              Mark all read
            </button>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="px-3 py-8 text-center text-[13px] text-muted-foreground/60">
            You&rsquo;re all caught up.
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {notifications.slice(0, 30).map((n) => (
              <NotificationRow
                key={n.id}
                n={n}
                busy={busyId === n.id}
                onOpen={handleOpen}
                onToggleRead={handleToggleRead}
                onDelete={(item) => void remove([item.id])}
                onRespond={(item, accept, permission) =>
                  void handleRespond(item, accept, permission)
                }
              />
            ))}
          </div>
        )}

        {notifications.length > 0 && (
          <div className="flex items-center justify-end border-t border-border px-3 py-2">
            <button
              type="button"
              onClick={() => void remove(notifications.map((n) => n.id))}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/60 transition-colors hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" strokeWidth={1.6} />
              Clear all
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
