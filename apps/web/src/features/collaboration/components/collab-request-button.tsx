"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import { requestCollaboration } from "@/domain/collaboration/actions";
import { setPendingCollabRequest } from "@/features/collaboration/lib/pending-collab";
import { showUserToast } from "@/shared/lib/user-toast";

type Status = "idle" | "pending" | "sent" | "already";

export function CollabRequestButton({
  noteId,
  onAuthRequired,
  initialStatus,
}: {
  noteId: string;
  onAuthRequired: () => void;
  initialStatus: "none" | "pending" | "collaborator";
}) {
  const [status, setStatus] = useState<Status>(
    initialStatus === "pending"
      ? "sent"
      : initialStatus === "collaborator"
        ? "already"
        : "idle",
  );
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (status !== "idle") return;
    setLoading(true);
    try {
      const result = await requestCollaboration(noteId);
      if (result.ok) {
        setStatus("sent");
        showUserToast("Collaboration request sent", "success");
      } else if (result.error === "unauthenticated") {
        // Remember the intent so it's replayed once the user is signed in —
        // OAuth full-page-redirects to /app and would otherwise lose this click.
        setPendingCollabRequest(noteId);
        onAuthRequired();
      } else {
        showUserToast(result.error ?? "Something went wrong", "error");
      }
    } catch {
      showUserToast("Something went wrong", "error");
    } finally {
      setLoading(false);
    }
  };

  const labels: Record<Status, string> = {
    idle: "Request to collaborate",
    pending: "Requesting...",
    sent: "Request sent",
    already: "Already a collaborator",
  };

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={loading || status !== "idle"}
      className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-[11px] font-medium text-foreground/80 transition-opacity hover:opacity-85 active:scale-[0.97] disabled:cursor-default disabled:opacity-60"
    >
      <Users className="h-3 w-3" strokeWidth={1.5} />
      {loading ? "Requesting..." : labels[status]}
    </button>
  );
}
