import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/core/db";
import { buildWorkspaceExportResponse } from "@/domain/data-transfer/export-workspace";

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

	return buildWorkspaceExportResponse({ prisma: prismaClient, userId, includeVersions });
}
