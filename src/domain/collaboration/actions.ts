"use server";

import { getAuthenticatedUser, tryGetAuthenticatedUser } from "@/core/db";
import { isGuestScopedId } from "@/domain/notes/note-id";
import { isUniqueConstraintError } from "@/domain/persistence/guards";
import { revalidatePath } from "next/cache";
import type { TCollabPermission } from "./models";
import {
  getCollaborators,
  getPendingRequestsForNote,
  getNotifications,
  getSharedNotes,
} from "./queries";

// ─── Server action wrappers (callable from client via TanStack Query) ─────────

export async function getCollaboratorsAction(noteId: string) {
  return getCollaborators(noteId);
}

export async function getPendingRequestsAction(noteId: string) {
  return getPendingRequestsForNote(noteId);
}

export async function getNotificationsAction() {
  return getNotifications();
}

export async function getSharedNotesAction() {
  return getSharedNotes();
}

// ─── Mutation actions ─────────────────────────────────────────────────────────

export async function requestCollaboration(
  noteId: string,
  message?: string,
): Promise<{ ok: boolean; error?: string }> {
  if (isGuestScopedId(noteId)) return { ok: false, error: "Invalid note" };

  const { prisma, user } = await tryGetAuthenticatedUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const note = await prisma.note.findUnique({ where: { id: noteId } });
  if (!note) return { ok: false, error: "Note not found" };
  if (note.userId === user.id) return { ok: false, error: "You own this note" };

  const existing = await prisma.collaborationRequest.findUnique({
    where: { noteId_requesterId: { noteId, requesterId: user.id } },
  });
  if (existing?.status === "pending") return { ok: false, error: "Request already pending" };
  if (existing?.status === "accepted") return { ok: false, error: "Already a collaborator" };

  // Upsert keyed on the (noteId, requesterId) unique constraint so two concurrent
  // first-time requests can't both INSERT and crash on P2002. The try/catch covers
  // the residual race where Prisma's non-atomic upsert still loses to a parallel
  // insert — that simply means the request already exists, which is success here.
  try {
    await prisma.collaborationRequest.upsert({
      where: { noteId_requesterId: { noteId, requesterId: user.id } },
      create: {
        noteId,
        requesterId: user.id,
        ownerId: note.userId,
        message: message ?? null,
      },
      update: { status: "pending", message: message ?? null, resolvedAt: null },
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
  }

  await prisma.notification.create({
    data: {
      userId: note.userId,
      type: "collab_request",
      payload: { noteId, noteName: note.name, requesterId: user.id, requesterName: user.name },
    },
  });

  return { ok: true };
}

export async function respondToCollabRequest(
  requestId: string,
  accept: boolean,
  permission: TCollabPermission = "viewer",
): Promise<{ ok: boolean; error?: string }> {
  const { prisma, user } = await getAuthenticatedUser();

  const request = await prisma.collaborationRequest.findUnique({
    where: { id: requestId },
    include: { note: true },
  });
  if (!request) return { ok: false, error: "Request not found" };
  if (request.ownerId !== user.id) return { ok: false, error: "Forbidden" };
  if (request.status !== "pending") return { ok: false, error: "Request already resolved" };

  // Atomic transition: only flip a still-pending request owned by this user.
  // Guards against two concurrent responses (e.g. double-click, or accept+decline)
  // both passing the status check above and producing duplicate side effects.
  const { count } = await prisma.collaborationRequest.updateMany({
    where: { id: requestId, ownerId: user.id, status: "pending" },
    data: { status: accept ? "accepted" : "declined", resolvedAt: new Date() },
  });
  if (count !== 1) return { ok: false, error: "Request already resolved" };

  if (accept) {
    await prisma.noteCollaborator.upsert({
      where: { noteId_userId: { noteId: request.noteId, userId: request.requesterId } },
      create: {
        noteId: request.noteId,
        userId: request.requesterId,
        permission,
        invitedBy: user.id,
      },
      update: { permission },
    });
  }

  await prisma.notification.create({
    data: {
      userId: request.requesterId,
      type: accept ? "collab_accepted" : "collab_declined",
      payload: {
        noteId: request.noteId,
        noteName: request.note.name,
        permission: accept ? permission : undefined,
      },
    },
  });

  revalidatePath("/app");
  return { ok: true };
}

export async function updateCollaboratorPermission(
  noteId: string,
  userId: string,
  permission: TCollabPermission,
): Promise<{ ok: boolean }> {
  const { prisma, user } = await getAuthenticatedUser();

  const note = await prisma.note.findUnique({ where: { id: noteId } });
  if (!note || note.userId !== user.id) return { ok: false };

  await prisma.noteCollaborator.update({
    where: { noteId_userId: { noteId, userId } },
    data: { permission },
  });

  return { ok: true };
}

export async function revokeCollaborator(
  noteId: string,
  userId: string,
): Promise<{ ok: boolean }> {
  const { prisma, user } = await getAuthenticatedUser();

  const note = await prisma.note.findUnique({ where: { id: noteId } });
  if (!note || note.userId !== user.id) return { ok: false };

  await prisma.noteCollaborator.deleteMany({
    where: { noteId, userId },
  });

  await prisma.notification.create({
    data: {
      userId,
      type: "collab_revoked",
      payload: { noteId, noteName: note.name },
    },
  });

  revalidatePath("/app");
  return { ok: true };
}

export async function markNotificationsRead(ids: string[]): Promise<void> {
  const { prisma, user } = await getAuthenticatedUser();
  await prisma.notification.updateMany({
    where: { id: { in: ids }, userId: user.id },
    data: { read: true },
  });
}

export async function getCollaborationStatusForNote(
  noteId: string,
): Promise<"none" | "pending" | "collaborator"> {
  if (isGuestScopedId(noteId)) return "none";
  const { prisma, user } = await tryGetAuthenticatedUser();
  if (!user) return "none";

  const collaborator = await prisma.noteCollaborator.findUnique({
    where: { noteId_userId: { noteId, userId: user.id } },
  });
  if (collaborator) return "collaborator";

  const request = await prisma.collaborationRequest.findUnique({
    where: { noteId_requesterId: { noteId, requesterId: user.id } },
  });
  if (request?.status === "pending") return "pending";

  return "none";
}
