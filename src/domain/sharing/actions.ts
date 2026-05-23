"use server";

import { getAuthenticatedUser } from "@/core/db";
import type { Prisma } from "@/generated/prisma/client";
import { getNote } from "@/domain/notes/queries";
import { markdownToRichDocument } from "@/domain/notes/rich-document";
import { generateShareToken, hashSharePassword } from "./crypto";
import { resolveExpiry } from "./expiry";
import {
	buildSharePath,
	type TNoteShareState,
	type TPublishNoteInput,
	type TUpdateShareInput,
} from "./models";

type ShareRecord = {
	token: string;
	name: string;
	content: string;
	passwordHash: string | null;
	viewOnce: boolean;
	expiresAt: Date | null;
	consumedAt: Date | null;
	revokedAt: Date | null;
	viewCount: number;
	lastViewedAt: Date | null;
	createdAt: Date;
};

function getAppBaseUrl(): string {
	return (
		process.env.NEXT_PUBLIC_BETTER_AUTH_URL ??
		process.env.BETTER_AUTH_URL ??
		""
	).replace(/\/$/, "");
}

function toShareState(share: ShareRecord, liveContent?: string): TNoteShareState {
	const path = buildSharePath(share.token);
	const base = getAppBaseUrl();
	return {
		token: share.token,
		path,
		url: base ? `${base}${path}` : path,
		hasPassword: Boolean(share.passwordHash),
		viewOnce: share.viewOnce,
		expiresAt: share.expiresAt?.toISOString() ?? null,
		consumedAt: share.consumedAt?.toISOString() ?? null,
		revokedAt: share.revokedAt?.toISOString() ?? null,
		viewCount: share.viewCount,
		lastViewedAt: share.lastViewedAt?.toISOString() ?? null,
		createdAt: share.createdAt.toISOString(),
		snapshotName: share.name,
		isStale: liveContent !== undefined && liveContent !== share.content,
	};
}

/** Create or re-activate a share for a note, snapshotting current content. */
export async function publishNote(input: TPublishNoteInput): Promise<TNoteShareState> {
	const { prisma, user } = await getAuthenticatedUser();

	const note = await getNote(input.noteId);
	if (!note) throw new Error("Note not found");

	const token = generateShareToken();
	const richContent = (note.richContent ??
		markdownToRichDocument(note.content)) as Prisma.InputJsonValue;
	const snapshot = {
		token,
		name: note.name,
		content: note.content,
		richContent,
		preferredEditorMode: note.preferredEditorMode ?? "block",
		viewOnce: input.viewOnce,
		expiresAt: resolveExpiry(input.expiry),
		passwordHash: input.password ? hashSharePassword(input.password) : null,
		consumedAt: null,
		revokedAt: null,
		viewCount: 0,
		lastViewedAt: null,
	};

	const share = await prisma.noteShare.upsert({
		where: { noteId: input.noteId },
		create: { noteId: input.noteId, userId: user.id, ...snapshot },
		update: snapshot,
	});

	return toShareState(share, note.content);
}

/** Update access controls on an existing share without re-snapshotting. */
export async function updateNoteShareSettings(
	input: TUpdateShareInput,
): Promise<TNoteShareState | null> {
	const { prisma, user } = await getAuthenticatedUser();

	const existing = await prisma.noteShare.findFirst({
		where: { noteId: input.noteId, userId: user.id },
	});
	if (!existing) return null;

	const data: Prisma.NoteShareUpdateInput = {
		viewOnce: input.viewOnce,
		expiresAt: resolveExpiry(input.expiry),
	};
	if (input.password !== undefined) {
		data.passwordHash = input.password ? hashSharePassword(input.password) : null;
	}

	const share = await prisma.noteShare.update({ where: { id: existing.id }, data });
	const note = await getNote(input.noteId);
	return toShareState(share, note?.content);
}

/** Re-freeze the snapshot from the note's current content. */
export async function refreshNoteShareSnapshot(
	noteId: string,
): Promise<TNoteShareState | null> {
	const { prisma, user } = await getAuthenticatedUser();

	const existing = await prisma.noteShare.findFirst({ where: { noteId, userId: user.id } });
	if (!existing) return null;

	const note = await getNote(noteId);
	if (!note) return null;

	const share = await prisma.noteShare.update({
		where: { id: existing.id },
		data: {
			name: note.name,
			content: note.content,
			richContent: (note.richContent ??
				markdownToRichDocument(note.content)) as Prisma.InputJsonValue,
			preferredEditorMode: note.preferredEditorMode ?? "block",
		},
	});

	return toShareState(share, note.content);
}

/** Unpublish: the public link stops resolving (reports "revoked"). */
export async function revokeNoteShare(noteId: string): Promise<void> {
	const { prisma, user } = await getAuthenticatedUser();
	await prisma.noteShare.updateMany({
		where: { noteId, userId: user.id, revokedAt: null },
		data: { revokedAt: new Date() },
	});
}

/** Current share state for a note, or null when it has never been published / is revoked. */
export async function getNoteShare(noteId: string): Promise<TNoteShareState | null> {
	const { prisma, user } = await getAuthenticatedUser();
	const share = await prisma.noteShare.findFirst({
		where: { noteId, userId: user.id, revokedAt: null },
	});
	if (!share) return null;
	const note = await getNote(noteId);
	return toShareState(share, note?.content);
}
