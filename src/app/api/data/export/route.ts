import { NextResponse } from "next/server";
import { zipSync } from "fflate";
import { getAuthenticatedUser } from "@/core/db";
import {
	buildExportArchiveFiles,
	getExportDownloadName,
} from "@/domain/data-transfer/export-build";

export async function GET(request: Request) {
	let prismaClient: Awaited<ReturnType<typeof getAuthenticatedUser>>["prisma"];
	let userId: string;
	try {
		const { prisma, user } = await getAuthenticatedUser();
		prismaClient = prisma;
		userId = user.id;
	} catch {
		return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
	}

	const { searchParams } = new URL(request.url);
	const includeVersions = searchParams.get("includeVersions") !== "false";

	const [folders, notes, journalEntries, journalTags, noteVersions] = await Promise.all([
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
				richContent: true,
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
		includeVersions
			? prismaClient.noteVersion.findMany({
					where: { userId },
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
