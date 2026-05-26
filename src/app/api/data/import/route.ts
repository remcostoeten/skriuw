import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/core/db";
import { mergeArchiveImport } from "@/domain/data-transfer/merge";
import { parseArchiveBuffer } from "@/domain/data-transfer/parse-archive";

const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : "Import failed.";
}

export async function POST(request: Request) {
	let prisma: Awaited<ReturnType<typeof getAuthenticatedUser>>["prisma"];
	let userId: string;
	try {
		const auth = await getAuthenticatedUser();
		prisma = auth.prisma;
		userId = auth.user.id;
	} catch {
		return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
	}

	const formData = await request.formData();
	const file = formData.get("file");
	if (!(file instanceof File)) {
		return NextResponse.json({ error: "Missing archive file." }, { status: 400 });
	}

	const buffer = new Uint8Array(await file.arrayBuffer());
	if (buffer.byteLength === 0) {
		return NextResponse.json({ error: "Archive file is empty." }, { status: 400 });
	}
	if (buffer.byteLength > MAX_ARCHIVE_BYTES) {
		return NextResponse.json({ error: "Archive is too large." }, { status: 413 });
	}

	try {
		const archive = parseArchiveBuffer(buffer);
		const result = await mergeArchiveImport(prisma, userId, archive);
		return NextResponse.json(result);
	} catch (error) {
		return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
	}
}
