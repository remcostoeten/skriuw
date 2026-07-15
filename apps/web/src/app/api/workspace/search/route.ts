import { NextResponse } from "next/server";
import { searchNotes } from "@/features/notes/server/search-notes";
import { requireWorkspaceUser, unauthorized } from "../_shared";

export async function GET(request: Request) {
	const ctx = await requireWorkspaceUser();
	if (!ctx) return unauthorized();

	const query = new URL(request.url).searchParams.get("q") ?? "";
	const semantic = new URL(request.url).searchParams.get("mode") === "semantic";
	const hits = await searchNotes(query, 20, { semantic });

	return NextResponse.json(
		hits.map((hit) => ({ noteId: hit.id, title: hit.name, snippet: hit.snippet })),
	);
}
