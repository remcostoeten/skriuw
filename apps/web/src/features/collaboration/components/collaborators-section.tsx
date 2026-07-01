"use client";

import { useState } from "react";
import { Check, ChevronDown, CircleAlert, LoaderCircle, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getCollaboratorsAction,
  getPendingRequestsAction,
  respondToCollabRequest,
  revokeCollaborator,
  updateCollaboratorPermission,
} from "@/domain/collaboration/actions";
import { showUserToast } from "@/shared/lib/user-toast";
import { cn } from "@/shared/lib/utils";
import type {
  TCollabPermission,
  TCollabRequest,
  TCollaborator,
} from "@/domain/collaboration/models";
import { AvatarFace } from "@/shared/icons/avatar-face";
import { deriveAvatarColor } from "@/shared/lib/avatar";
import { useWorkspaceCapabilities } from "@/core/workspace-backend";

const collabKeys = {
  collaborators: (noteId: string) => ["collaborators", noteId] as const,
  pendingRequests: (noteId: string) => ["collab-requests", noteId] as const,
};

function PermissionToggle({
  value,
  onChange,
  label,
}: {
  value: TCollabPermission;
  onChange: (p: TCollabPermission) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground/70 transition-colors hover:border-foreground/30 hover:text-foreground"
      >
        {label ? `${label} ${value}` : value}
        <ChevronDown className="h-2.5 w-2.5" strokeWidth={1.5} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-0.5 w-24 overflow-hidden border border-border bg-popover py-1 text-popover-foreground shadow-md">
            {(["viewer", "editor"] as TCollabPermission[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  onChange(p);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] transition-colors hover:bg-muted",
                  value === p && "font-medium text-foreground",
                )}
              >
                {value === p ? (
                  <Check className="h-3 w-3" strokeWidth={2} />
                ) : (
                  <span className="h-3 w-3" />
                )}
                {p}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function CollaboratorsSection(props: {
  noteId: string;
  ownerName: string;
  isOwner: boolean;
}) {
  const { collaboration } = useWorkspaceCapabilities();
  if (!collaboration) return null;
  return <CollaboratorsSectionInner {...props} />;
}

function CollaboratorsSectionInner({
  noteId,
  ownerName,
  isOwner,
}: {
  noteId: string;
  ownerName: string;
  isOwner: boolean;
}) {
  const qc = useQueryClient();

  const collaboratorsQuery = useQuery({
    queryKey: collabKeys.collaborators(noteId),
    queryFn: () => getCollaboratorsAction(noteId),
    enabled: isOwner,
  });

  const pendingQuery = useQuery({
    queryKey: collabKeys.pendingRequests(noteId),
    queryFn: () => getPendingRequestsAction(noteId),
    enabled: isOwner,
    refetchInterval: 30_000,
  });

  const collaboratorsKey = collabKeys.collaborators(noteId);
  const pendingKey = collabKeys.pendingRequests(noteId);

  // Pending requests live in a separate query, so accepting/declining only needs
  // to drop the row optimistically; the new collaborator (on accept) lands when
  // the collaborators query reconciles on settle.
  const respondMutation = useMutation({
    mutationFn: ({
      id,
      accept,
      permission,
    }: {
      id: string;
      accept: boolean;
      permission?: TCollabPermission;
    }) => respondToCollabRequest(id, accept, permission),
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: pendingKey });
      const previous = qc.getQueryData<TCollabRequest[]>(pendingKey);
      qc.setQueryData<TCollabRequest[]>(pendingKey, (cur = []) =>
        cur.filter((req) => req.id !== id),
      );
      return { previous };
    },
    onError: (_error, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(pendingKey, ctx.previous);
      showUserToast("Couldn't respond to request", "error");
    },
    onSuccess: (result, vars, ctx) => {
      if (result.ok) {
        showUserToast(
          vars.accept ? "Collaborator added" : "Request declined",
          "success",
        );
      } else {
        if (ctx?.previous) qc.setQueryData(pendingKey, ctx.previous);
        showUserToast(result.error ?? "Couldn't respond to request", "error");
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: pendingKey });
      void qc.invalidateQueries({ queryKey: collaboratorsKey });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (userId: string) => revokeCollaborator(noteId, userId),
    onMutate: async (userId) => {
      await qc.cancelQueries({ queryKey: collaboratorsKey });
      const previous = qc.getQueryData<TCollaborator[]>(collaboratorsKey);
      qc.setQueryData<TCollaborator[]>(collaboratorsKey, (cur = []) =>
        cur.filter((c) => c.userId !== userId),
      );
      return { previous };
    },
    onError: (_error, _userId, ctx) => {
      if (ctx?.previous) qc.setQueryData(collaboratorsKey, ctx.previous);
      showUserToast("Couldn't revoke access", "error");
    },
    onSuccess: (result, _userId, ctx) => {
      if (result.ok) {
        showUserToast("Access revoked", "success");
      } else {
        if (ctx?.previous) qc.setQueryData(collaboratorsKey, ctx.previous);
        showUserToast("Couldn't revoke access", "error");
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: collaboratorsKey });
    },
  });

  const permissionMutation = useMutation({
    mutationFn: ({
      userId,
      permission,
    }: {
      userId: string;
      permission: TCollabPermission;
    }) => updateCollaboratorPermission(noteId, userId, permission),
    onMutate: async ({ userId, permission }) => {
      await qc.cancelQueries({ queryKey: collaboratorsKey });
      const previous = qc.getQueryData<TCollaborator[]>(collaboratorsKey);
      qc.setQueryData<TCollaborator[]>(collaboratorsKey, (cur = []) =>
        cur.map((c) => (c.userId === userId ? { ...c, permission } : c)),
      );
      return { previous };
    },
    onError: (_error, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(collaboratorsKey, ctx.previous);
      showUserToast("Couldn't update permission", "error");
    },
    onSuccess: (result, _vars, ctx) => {
      if (!result.ok && ctx?.previous) {
        qc.setQueryData(collaboratorsKey, ctx.previous);
        showUserToast("Couldn't update permission", "error");
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: collaboratorsKey });
    },
  });

  const collaborators = collaboratorsQuery.data ?? [];
  const pending = pendingQuery.data ?? [];

  if (!isOwner) {
    return (
      <p className="text-[13px] text-muted-foreground/60">
        Only the note owner can manage collaborators.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Owner row */}
      <div className="flex items-center gap-2.5">
        <AvatarFace name={ownerName} size={22} />
        <span className="flex-1 truncate text-[12px] text-foreground/80">
          {ownerName}
        </span>
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
          Owner
        </span>
      </div>

      {collaboratorsQuery.isLoading ? (
        <div className="flex items-center gap-2 py-1 text-[12px] text-muted-foreground/60">
          <LoaderCircle
            className="h-3.5 w-3.5 animate-spin"
            strokeWidth={1.5}
          />
          Loading collaborators…
        </div>
      ) : collaboratorsQuery.isError ? (
        <div className="flex items-center justify-between gap-2 py-1">
          <span className="flex items-center gap-2 text-[12px] text-destructive">
            <CircleAlert className="h-3.5 w-3.5" strokeWidth={1.5} />
            Couldn't load collaborators.
          </span>
          <button
            type="button"
            onClick={() => void collaboratorsQuery.refetch()}
            className="rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          {/* Collaborators */}
          {collaborators.map((c) => (
            <div key={c.id} className="flex items-center gap-2.5">
              <AvatarFace
                name={c.userName}
                color={deriveAvatarColor(c.userId)}
                size={22}
              />
              <span className="flex-1 truncate text-[12px] text-foreground/80">
                {c.userName}
              </span>
              <PermissionToggle
                value={c.permission}
                onChange={(p) =>
                  permissionMutation.mutate({ userId: c.userId, permission: p })
                }
              />
              <button
                type="button"
                onClick={() => revokeMutation.mutate(c.userId)}
                disabled={revokeMutation.isPending}
                className="flex h-5 w-5 items-center justify-center text-muted-foreground/50 hover:text-destructive"
                aria-label="Revoke access"
              >
                <X className="h-3 w-3" strokeWidth={1.5} />
              </button>
            </div>
          ))}

          {/* Pending requests */}
          {pending.length > 0 && (
            <div className="space-y-2 border-t border-border pt-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                Pending ({pending.length})
              </p>
              {pending.map((req) => (
                <div key={req.id} className="flex items-start gap-2.5">
                  <AvatarFace
                    name={req.requesterName}
                    color={deriveAvatarColor(req.requesterId)}
                    size={22}
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-[12px] text-foreground/80">
                      {req.requesterName}
                    </span>
                    {req.message && (
                      <p className="text-[11px] italic text-muted-foreground/60">
                        &ldquo;{req.message}&rdquo;
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        respondMutation.mutate({
                          id: req.id,
                          accept: true,
                          permission: "viewer",
                        })
                      }
                      disabled={respondMutation.isPending}
                      className="flex h-6 w-6 items-center justify-center rounded-md bg-foreground text-background transition-opacity hover:opacity-85"
                      aria-label="Accept"
                    >
                      <Check className="h-3 w-3" strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        respondMutation.mutate({ id: req.id, accept: false })
                      }
                      disabled={respondMutation.isPending}
                      className="flex h-6 w-6 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
                      aria-label="Decline"
                    >
                      <X className="h-3 w-3" strokeWidth={1.5} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {collaborators.length === 0 && pending.length === 0 && (
            <p className="text-[13px] text-muted-foreground/60">
              No collaborators yet.
            </p>
          )}
        </>
      )}
    </div>
  );
}
