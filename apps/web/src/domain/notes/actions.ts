"use server";

import { getAuthenticatedUser, tryGetAuthenticatedUser } from "@/core/db";
import type { Prisma } from "@/generated/prisma/client";
import { assertOwnedParentFolder, isRecordNotFoundError } from "@/core/persistence/guards";
import { parseServerInput, updateNoteInputSchema } from "@/domain/validation/schemas";
import { isGuestScopedId } from "@/domain/notes/note-id";
import { resolveNoteAccess, resolveReadableNote } from "@/domain/notes/note-access";
import type {
	NoteAccessRole,
	NoteFile,
	NoteVersion,
	NoteVersionReason,
	RichTextDocument,
} from "@/domain/notes/models";
import { markdownToRichDocument } from "@/domain/notes/rich-document";
import {
	type CreateNoteInput,
	createNoteForUser,
	insertNoteVersion,
	type NoteRecord,
	recordToNoteFile,
	recordToNoteVersion,
} from "@/domain/notes/note-write-core";
import { normalizeNoteProperties, type NoteProperty } from "@/domain/notes/properties";
import { listNoteMetadata, listNoteVersions } from "@/domain/notes/queries";
import { listNoteBacklinks } from "@/features/notes/server/backlinks-queries";
import type { ResolvedNoteLink } from "@/domain/notes/note-links";
import { deriveNoteNameFromHeading, nameTracksHeading } from "@/domain/notes/note-links";
import { syncNoteLinks } from "@/domain/notes/note-link-sync";
import { buildGraphData, type GraphData } from "@/domain/notes/graph";
import { refreshNoteEmbedding } from "@/features/notes/server/semantic-embeddings";
import type { SemanticSearchConfig } from "@/features/notes/server/semantic-embeddings";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getSemanticConfig(user: unknown): SemanticSearchConfig | undefined {
	return (user as { editorPreferences?: { ai?: SemanticSearchConfig } } | null)?.editorPreferences
		?.ai;
}

function uniquePersistedNoteIds(ids: string[]): string[] {
	return Array.from(
		new Set(ids.filter((id) => id && !isGuestScopedId(id) && UUID_PATTERN.test(id))),
	);
}

export async function listNotes(): Promise<NoteFile[]> {
	await getAuthenticatedUser();
	return listNoteMetadata();
}

export async function createNote(input: CreateNoteInput): Promise<NoteFile> {
	const { prisma, user } = await getAuthenticatedUser();
	const note = await createNoteForUser(prisma, user.id, input);
	refreshNoteEmbedding(prisma, note, getSemanticConfig(user), user.id);
	return note;
}

export type UpdateNoteInput = {
	id: string;
	name?: string;
	content?: string;
	richContent?: RichTextDocument;
	preferredEditorMode?: "raw" | "block";
	parentId?: string | null;
	sortOrder?: number;
	tags?: string[];
	properties?: NoteProperty[];
	icon?: string;
	cover?: string;
	annotationScene?: string;
	createCheckpoint?: boolean;
	sessionVersionId?: string | null;
	/**
	 * When `false`, this save must not auto-rename the note from its first
	 * heading. Autosaves pass `false` so the filename only follows the heading
	 * once the editor commits it (the user leaves the heading block, which sends
	 * an explicit `name`). Omitted/`true` keeps the legacy heading-tracking.
	 */
	trackHeading?: boolean;
};

export type UpdateNoteResult = {
	note?: NoteFile;
	versionCreated: boolean;
	versionChanged?: boolean;
	versionId?: string | null;
};

export async function updateNote(input: UpdateNoteInput): Promise<UpdateNoteResult> {
	if (isGuestScopedId(input.id)) {
		return { versionCreated: false };
	}

	const validated = parseServerInput(updateNoteInputSchema, input);
	const { prisma, user } = await getAuthenticatedUser();

	// Content/name/tags/mode are editable by the owner and by an "editor"
	// collaborator. parentId/sortOrder are workspace organization and stay
	// owner-only, so they're layered onto the owner patch only.
	const basePatch: Prisma.NoteUncheckedUpdateInput = {};
	if (validated.name !== undefined) {
		basePatch.name = validated.name.endsWith(".md") ? validated.name : `${validated.name}.md`;
	}
	if (validated.content !== undefined) {
		basePatch.content = validated.content;
		basePatch.richContent = (validated.richContent ??
			markdownToRichDocument(validated.content)) as Prisma.InputJsonValue;
	} else if (validated.richContent !== undefined) {
		basePatch.richContent = validated.richContent as Prisma.InputJsonValue;
	}
	if (validated.preferredEditorMode !== undefined) {
		basePatch.preferredEditorMode = validated.preferredEditorMode;
	}
	if (validated.tags !== undefined) {
		basePatch.tags = validated.tags;
	}
	if (validated.properties !== undefined) {
		basePatch.properties = normalizeNoteProperties(
			validated.properties,
		) as Prisma.InputJsonValue;
	}
	if (validated.icon !== undefined) {
		basePatch.icon = validated.icon || null;
	}
	if (validated.cover !== undefined) {
		basePatch.cover = validated.cover || null;
	}
	if (validated.annotationScene !== undefined) {
		basePatch.annotationScene = validated.annotationScene || null;
	}

	const ownerPatch: Prisma.NoteUncheckedUpdateInput = { ...basePatch };
	if (validated.parentId !== undefined) {
		ownerPatch.parentId = validated.parentId;
	}
	if (validated.sortOrder !== undefined) {
		ownerPatch.sortOrder = validated.sortOrder;
	}

	const result = await prisma.$transaction(async (tx) => {
		// Owner fast path: one round trip, no `resolveNoteAccess`. This is the hot
		// path (every batched keystroke autosaves), so we attempt the cheap
		// owner-scoped update first and only resolve collaborator access on P2025
		// (no owner row matched). Editor saves cost an extra failed-update + resolve,
		// but they're rare — the right bias.
		let record: NoteRecord | null = null;
		let ownerId = user.id;
		let role: NoteAccessRole = "owner";

		// Snapshot the pre-update content so we can later tell a heading-tracked
		// filename apart from a user-set one. This MUST be read before the content
		// write below — reading it afterwards compares the name against the *new*
		// heading, which makes tracking stop after the first rename. Skipped when
		// the caller opts out (`trackHeading: false`, e.g. autosaves) or when no
		// usable heading could be derived.
		let priorHeadingContent: string | null = null;
		const mayTrackHeading =
			validated.trackHeading !== false &&
			validated.name === undefined &&
			validated.content !== undefined &&
			deriveNoteNameFromHeading(validated.content) !== null;
		if (mayTrackHeading) {
			const prior = await tx.note.findUnique({
				where: { id: validated.id },
				select: { content: true },
			});
			priorHeadingContent = prior?.content ?? null;
		}

		try {
			// Moving a note validates the destination folder, owner-only.
			if (validated.parentId !== undefined) {
				await assertOwnedParentFolder(tx, user.id, validated.parentId);
			}
			record = await tx.note.update({
				where: { id: validated.id, userId: user.id, deletedAt: null },
				data: ownerPatch,
			});
		} catch (error) {
			if (!isRecordNotFoundError(error)) throw error;
			// Not the owner (or note gone): resolve collaborator access.
			const access = await resolveNoteAccess(tx, user.id, validated.id);
			if (!access || access.role === "viewer") return { versionCreated: false };
			ownerId = access.ownerId;
			role = access.role; // "editor"
			try {
				record = await tx.note.update({
					where: { id: validated.id, deletedAt: null },
					data: basePatch,
				});
			} catch (err2) {
				if (isRecordNotFoundError(err2)) return { versionCreated: false };
				throw err2;
			}
		}

		if (!record) return { versionCreated: false };

		// Keep the filename tracking the note's first heading as it's edited, while
		// never clobbering a manual rename. Gated by `mayTrackHeading` above, so it
		// only runs for opted-in saves (the editor's heading commit) — autosaves
		// pass `trackHeading: false` and skip this. We compare against
		// `priorHeadingContent` (captured before the write) so the "is this name
		// still heading-tracked?" check sees the pre-edit heading.
		if (mayTrackHeading && priorHeadingContent !== null) {
			const derivedName = deriveNoteNameFromHeading(validated.content!);
			if (
				derivedName &&
				derivedName !== record.name &&
				nameTracksHeading(record.name, priorHeadingContent)
			) {
				record = await tx.note.update({
					where: { id: validated.id, deletedAt: null },
					data: { name: derivedName },
				});
			}
		}

		const updatedNote = recordToNoteFile(record, { ownerId, role });
		if (
			validated.content !== undefined ||
			validated.richContent !== undefined ||
			validated.tags !== undefined ||
			validated.properties !== undefined
		) {
			await syncNoteLinks(tx, ownerId, updatedNote);
		}
		const versionReason: NoteVersionReason =
			validated.name !== undefined
				? "rename"
				: validated.createCheckpoint
					? "checkpoint"
					: "autosave";
		const noteSnapshot = {
			name: updatedNote.name,
			content: updatedNote.content,
			richContent: updatedNote.richContent,
			preferredEditorMode: updatedNote.preferredEditorMode,
			parentId: updatedNote.parentId,
			tags: updatedNote.tags ?? [],
			properties: updatedNote.properties ?? [],
		};

		// Every write — autosaves included — goes through insertNoteVersion,
		// whose decision logic skips trivial edits and coalesces same-burst
		// saves into the latest row. sessionVersionId is accepted for client
		// compatibility but no longer drives persistence.
		const versionId = await insertNoteVersion(
			tx,
			ownerId,
			validated.id,
			noteSnapshot,
			versionReason,
		);
		const versionCreated = versionId !== null;

		return {
			note: updatedNote,
			versionCreated,
			versionChanged: versionCreated,
			versionId,
		};
	});
	if (result.note && (validated.content !== undefined || validated.name !== undefined)) {
		refreshNoteEmbedding(prisma, result.note, getSemanticConfig(user), user.id);
	}
	return result;
}

export async function restoreNoteVersion(versionId: string): Promise<UpdateNoteResult> {
	const { prisma, user } = await getAuthenticatedUser();

	return prisma.$transaction(async (tx) => {
		// Versions live under the owner, so load the row by id (not user-scoped)
		// and authorize via `resolveNoteAccess`: owner or "editor" may restore.
		const versionRecord = await tx.noteVersion.findUnique({
			where: { id: versionId },
		});
		if (!versionRecord) return { versionCreated: false };

		const version = recordToNoteVersion(versionRecord);
		const access = await resolveNoteAccess(tx, user.id, version.noteId);
		if (!access || access.role === "viewer") return { versionCreated: false };
		const ownerId = access.ownerId;

		const currentRecord = await tx.note.findFirst({
			where: { id: version.noteId, deletedAt: null },
		});
		if (!currentRecord) return { versionCreated: false };

		const current = recordToNoteFile(currentRecord);

		await insertNoteVersion(
			tx,
			ownerId,
			current.id,
			{
				name: current.name,
				content: current.content,
				richContent: current.richContent,
				preferredEditorMode: current.preferredEditorMode,
				parentId: current.parentId,
				tags: current.tags ?? [],
				properties: current.properties ?? [],
			},
			"restore",
		);

		let updated: NoteRecord | null;
		try {
			updated = await tx.note.update({
				where: { id: version.noteId, deletedAt: null },
				data: {
					name: version.name,
					content: version.content,
					richContent: version.richContent as Prisma.InputJsonValue,
					preferredEditorMode: version.preferredEditorMode,
					parentId: version.parentId,
					tags: version.tags ?? [],
					properties: normalizeNoteProperties(
						version.properties,
					) as Prisma.InputJsonValue,
				},
			});
		} catch (error) {
			if (!isRecordNotFoundError(error)) throw error;
			updated = null;
		}
		return {
			note: updated ? recordToNoteFile(updated, { ownerId, role: access.role }) : undefined,
			versionCreated: true,
		};
	});
}

export async function deleteNote(id: string): Promise<void> {
	if (isGuestScopedId(id)) return;

	const { prisma, user } = await getAuthenticatedUser();
	await prisma.note.updateMany({
		where: { id, userId: user.id, deletedAt: null },
		data: { deletedAt: new Date() },
	});
}

export async function deleteNotes(ids: string[]): Promise<void> {
	const persistedIds = ids.filter((id) => !isGuestScopedId(id));
	if (persistedIds.length === 0) return;

	const { prisma, user } = await getAuthenticatedUser();
	await prisma.note.updateMany({
		where: { id: { in: persistedIds }, userId: user.id, deletedAt: null },
		data: { deletedAt: new Date() },
	});
}

export async function fetchNote(id: string): Promise<NoteFile | null> {
	if (isGuestScopedId(id)) return null;
	const { prisma, user } = await tryGetAuthenticatedUser();
	if (!user) return null;

	// Single authorization gate: owner or accepted collaborator, with the row.
	const resolved = await resolveReadableNote(prisma, user.id, id);
	if (!resolved) return null;
	return recordToNoteFile(resolved.record, {
		ownerId: resolved.ownerId,
		role: resolved.role,
	});
}

export async function fetchNotes(ids: string[]): Promise<NoteFile[]> {
	const { prisma, user } = await tryGetAuthenticatedUser();
	if (!user) return [];

	const persistedIds = uniquePersistedNoteIds(ids);
	if (persistedIds.length === 0) return [];

	const records = await prisma.note.findMany({
		where: {
			userId: user.id,
			id: { in: persistedIds },
			deletedAt: null,
		},
	});
	// Owner-scoped batch fetch — every row belongs to the requesting user.
	return records.map((record) => recordToNoteFile(record, { ownerId: user.id, role: "owner" }));
}

export async function fetchNoteBacklinks(id: string): Promise<ResolvedNoteLink[]> {
	const { user } = await tryGetAuthenticatedUser();
	if (!user) return [];

	return listNoteBacklinks(id);
}

export async function fetchNoteVersions(id: string): Promise<NoteVersion[]> {
	const { user } = await tryGetAuthenticatedUser();
	if (!user) return [];

	return listNoteVersions(id);
}

// Builds the whole-workspace knowledge graph (notes + tags as nodes, persisted
// note_links as edges) plus connectivity/cluster metrics for the graph view.
export async function fetchNoteGraph(): Promise<GraphData> {
	const { prisma, user } = await tryGetAuthenticatedUser();
	if (!user) {
		return buildGraphData([], []);
	}

	const [notes, links, people, journals, journalLinks] = await Promise.all([
		prisma.note.findMany({
			where: { userId: user.id, deletedAt: null },
			select: { id: true, name: true, createdAt: true },
		}),
		prisma.noteLink.findMany({
			where: { userId: user.id },
			select: { sourceNoteId: true, targetNoteId: true, targetLabel: true, kind: true },
		}),
		prisma.person.findMany({
			where: { userId: user.id },
			select: { id: true, name: true },
		}),
		prisma.journalEntry.findMany({
			where: { userId: user.id, deletedAt: null },
			select: { id: true, title: true, dateKey: true, createdAt: true },
		}),
		prisma.journalLink.findMany({
			where: { userId: user.id, sourceJournal: { deletedAt: null } },
			select: { sourceJournalId: true, targetNoteId: true, targetLabel: true, kind: true },
		}),
	]);

	return buildGraphData(notes, links, { people, journals, journalLinks });
}
