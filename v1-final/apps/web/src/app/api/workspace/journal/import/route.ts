import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/core/db";
import { MAX_ICS_IMPORT_BYTES, type JournalImportMode } from "@/domain/journal/ics-import";
import { importJournalIcs } from "@/domain/journal/ics-import-server";

function errorResponse(error: unknown) {
	const message = error instanceof Error ? error.message : "";
	if (message === "This file is not an iCalendar (.ics) document.") {
		return NextResponse.json({ error: message }, { status: 400 });
	}
	return NextResponse.json(
		{ error: "Calendar import could not be committed. No entries were changed." },
		{ status: 409 },
	);
}

export async function POST(request: Request) {
	let auth: Awaited<ReturnType<typeof getAuthenticatedUser>>;
	try {
		auth = await getAuthenticatedUser();
	} catch {
		return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
	}

	const declaredSize = Number(request.headers.get("content-length") ?? 0);
	if (declaredSize > MAX_ICS_IMPORT_BYTES) {
		return NextResponse.json(
			{ error: "Calendar file exceeds the 5 MB limit." },
			{ status: 413 },
		);
	}

	const mode: JournalImportMode =
		new URL(request.url).searchParams.get("mode") === "update" ? "update" : "skip";
	const text = await request.text();
	if (new TextEncoder().encode(text).length > MAX_ICS_IMPORT_BYTES) {
		return NextResponse.json(
			{ error: "Calendar file exceeds the 5 MB limit." },
			{ status: 413 },
		);
	}

	try {
		const result = await importJournalIcs(auth.prisma, auth.user.id, text, mode);
		return NextResponse.json(result);
	} catch (error) {
		return errorResponse(error);
	}
}
