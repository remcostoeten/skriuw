import { NextResponse } from "next/server";
import { zipSync } from "fflate";
import { getAuthenticatedUser } from "@/core/db";
import {
	buildExportArchiveFiles,
	getExportDownloadName,
} from "@/domain/data-transfer/export-build";

export async function GET() {
	let prismaClient: Awaited<ReturnType<typeof getAuthenticatedUser>>["prisma"];
	let userId: string;
	try {
		const { prisma, user } = await getAuthenticatedUser();
		prismaClient = prisma;
		userId = user.id;
	} catch {
		return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
	}

	const [folders, notes, journalEntries, journalTags] = await Promise.all([
		prismaClient.folder.findMany({
			where: { userId, deletedAt: null },
			select: { id: true, name: true, parentId: true, sortOrder: true },
		}),
		prismaClient.note.findMany({
			where: { userId, deletedAt: null },
			select: {
				id: true,
				name: true,
				content: true,
				tags: true,
				parentId: true,
				sortOrder: true,
				preferredEditorMode: true,
				createdAt: true,
				updatedAt: true,
			},
		}),
		prismaClient.journalEntry.findMany({
			where: { userId, deletedAt: null },
			orderBy: { dateKey: "asc" },
			select: { id: true, dateKey: true, content: true, mood: true, tags: true },
		}),
		prismaClient.journalTag.findMany({
			where: { userId, deletedAt: null },
			select: { name: true, color: true },
			orderBy: { name: "asc" },
		}),
	]);

	const exportedAt = new Date();
	const files = buildExportArchiveFiles({
		folders,
		notes,
		journalEntries,
		journalTags,
		exportedAt,
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
