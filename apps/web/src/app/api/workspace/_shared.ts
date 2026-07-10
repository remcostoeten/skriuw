import { NextResponse } from "next/server";
import { tryGetAuthenticatedUser } from "@/core/db";
import type { NoteFile } from "@/domain/notes/models";
import { getNoteTitle } from "@/domain/notes/note-links";

/**
 * Session-cookie auth for the mobile client (Better Auth Expo persists the
 * same cookie the web app uses, via expo-secure-store). Unlike /api/sync/*,
 * there's no bearer token here — the mobile app is a trusted first-party
 * client authenticating the same way the web app does.
 */
export async function requireWorkspaceUser() {
	const { prisma, user } = await tryGetAuthenticatedUser();
	if (!user) return null;
	return { prisma, user };
}

export function unauthorized() {
	return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
}

export function notFound() {
	return NextResponse.json({ error: "Not found" }, { status: 404 });
}

function toEditorMode(mode: NoteFile["preferredEditorMode"]): "rich" | "raw" {
	return mode === "raw" ? "raw" : "rich";
}

export function noteToSummary(note: NoteFile) {
	return {
		id: note.id,
		title: getNoteTitle(note),
		folderId: note.parentId,
		updatedAt: note.modifiedAt.toISOString(),
		createdAt: note.createdAt.toISOString(),
		coverUrl: note.cover ?? null,
		sortOrder: note.sortOrder ?? 0,
	};
}

export function noteToFull(note: NoteFile) {
	return {
		...noteToSummary(note),
		content: note.content,
		richContent: note.richContent,
		preferredEditorMode: toEditorMode(note.preferredEditorMode),
	};
}
