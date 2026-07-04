import "server-only";

import { zipSync } from "fflate";
import type { PrismaClient } from "@/generated/prisma/client";
import {
	buildExportArchiveFiles,
	getExportDownloadName,
} from "@/domain/data-transfer/export-build";

type ExportWorkspaceInput = {
	prisma: PrismaClient;
	userId: string;
	includeVersions?: boolean;
};

export async function buildWorkspaceExportResponse(input: ExportWorkspaceInput): Promise<Response> {
	const includeVersions = input.includeVersions ?? true;

	const [
		folders,
		notes,
		journalEntries,
		journalTags,
		noteVersions,
		deletedFolders,
		deletedNotes,
		deletedJournalEntries,
		deletedJournalTags,
	] = await Promise.all([
		input.prisma.folder.findMany({
			where: { userId: input.userId, deletedAt: null },
			select: { id: true, name: true, parentId: true, sortOrder: true },
		}),
		input.prisma.note.findMany({
			where: { userId: input.userId, deletedAt: null },
			select: {
				id: true,
				name: true,
				content: true,
				richContent: true,
				tags: true,
				parentId: true,
				sortOrder: true,
				preferredEditorMode: true,
				icon: true,
				createdAt: true,
				updatedAt: true,
			},
		}),
		input.prisma.journalEntry.findMany({
			where: { userId: input.userId, deletedAt: null },
			orderBy: { dateKey: "asc" },
			select: { id: true, dateKey: true, content: true, mood: true, tags: true },
		}),
		input.prisma.journalTag.findMany({
			where: { userId: input.userId, deletedAt: null },
			select: { name: true, color: true },
			orderBy: { name: "asc" },
		}),
		includeVersions
			? input.prisma.noteVersion.findMany({
					where: { userId: input.userId },
					orderBy: { createdAt: "asc" },
					select: {
						id: true,
						noteId: true,
						name: true,
						content: true,
						richContent: true,
						preferredEditorMode: true,
						parentId: true,
						tags: true,
						reason: true,
						contentHash: true,
						createdAt: true,
					},
				})
			: Promise.resolve([]),
		// Tombstones — surfaced so the desktop puller can mirror deletions
		// instead of only ever upserting (see `pull-workspace.ts`).
		input.prisma.folder.findMany({
			where: { userId: input.userId, deletedAt: { not: null } },
			select: { id: true },
		}),
		input.prisma.note.findMany({
			where: { userId: input.userId, deletedAt: { not: null } },
			select: { id: true },
		}),
		input.prisma.journalEntry.findMany({
			where: { userId: input.userId, deletedAt: { not: null } },
			select: { id: true },
		}),
		input.prisma.journalTag.findMany({
			where: { userId: input.userId, deletedAt: { not: null } },
			select: { name: true },
		}),
	]);

	const exportedAt = new Date();
	const files = buildExportArchiveFiles({
		folders,
		notes,
		journalEntries,
		journalTags,
		noteVersions,
		includeVersions,
		exportedAt,
		deletedIds: {
			folders: deletedFolders.map((f) => f.id),
			notes: deletedNotes.map((n) => n.id),
			journalEntries: deletedJournalEntries.map((e) => e.id),
			journalTags: deletedJournalTags.map((t) => t.name),
		},
	});
	const zip = zipSync(files);
	const blob = new Blob([zip]);

	return new Response(blob, {
		headers: {
			"Content-Type": "application/zip",
			"Content-Disposition": `attachment; filename="${getExportDownloadName(exportedAt)}"`,
			"Content-Length": String(blob.size),
			"Cache-Control": "no-store",
		},
	});
}
