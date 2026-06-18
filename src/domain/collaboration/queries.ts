import "server-only";
import { getAuthenticatedUser } from "@/core/db";
import { assertOwnsNote } from "@/domain/persistence/guards";
import type { TCollabRequest, TCollaborator, TSharedNote, TNotification } from "./models";

export async function getCollaborators(noteId: string): Promise<TCollaborator[]> {
  const { prisma, user } = await getAuthenticatedUser();
  // Only the note owner may enumerate collaborators. Without this guard any
  // authenticated user could read collaborator identities for any noteId.
  if (!(await assertOwnsNote(prisma, user.id, noteId))) return [];
  const rows = await prisma.noteCollaborator.findMany({
    where: { noteId },
    include: { user: true, inviter: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    noteId: r.noteId,
    userId: r.userId,
    userName: r.user.name,
    userImage: r.user.image ?? null,
    userEmail: r.user.email,
    permission: r.permission as "viewer" | "editor",
    invitedBy: r.invitedBy,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function getPendingRequestsForNote(noteId: string): Promise<TCollabRequest[]> {
  const { prisma, user } = await getAuthenticatedUser();
  // Pending requests (requester identity + message) are owner-only data.
  if (!(await assertOwnsNote(prisma, user.id, noteId))) return [];
  const rows = await prisma.collaborationRequest.findMany({
    where: { noteId, status: "pending" },
    include: { requester: true, note: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    noteId: r.noteId,
    noteName: r.note.name,
    requesterId: r.requesterId,
    requesterName: r.requester.name,
    requesterImage: r.requester.image ?? null,
    ownerId: r.ownerId,
    status: r.status as "pending" | "accepted" | "declined",
    message: r.message ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function getSharedNotes(): Promise<TSharedNote[]> {
  const { prisma, user } = await getAuthenticatedUser();
  const rows = await prisma.noteCollaborator.findMany({
    where: { userId: user.id },
    include: { note: { include: { user: true } } },
    orderBy: { createdAt: "desc" },
  });
  return rows
    .filter((r) => !r.note.deletedAt)
    .map((r) => ({
      id: r.note.id,
      name: r.note.name,
      ownerId: r.note.userId,
      ownerName: r.note.user.name,
      permission: r.permission as "viewer" | "editor",
      createdAt: r.note.createdAt.toISOString(),
      updatedAt: r.note.updatedAt.toISOString(),
      preferredEditorMode: r.note.preferredEditorMode ?? null,
      content: r.note.content,
      richContent: r.note.richContent,
      tags: r.note.tags,
    }));
}

export async function getNotifications(): Promise<TNotification[]> {
  const { prisma, user } = await getAuthenticatedUser();
  const rows = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return rows.map((r) => ({
    id: r.id,
    type: r.type as TNotification["type"],
    payload: r.payload as Record<string, unknown>,
    read: r.read,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function getUnreadNotificationCount(): Promise<number> {
  const { prisma, user } = await getAuthenticatedUser();
  return prisma.notification.count({ where: { userId: user.id, read: false } });
}
