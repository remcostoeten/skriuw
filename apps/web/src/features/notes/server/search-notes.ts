"use server";

import { tryGetAuthenticatedUser } from "@/core/db";
import type { NoteSearchHit } from "@/core/workspace-backend/types";
import { buildSearchSnippet } from "@/domain/notes/search-snippet";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

type NoteSearchRow = {
	id: string;
	name: string;
	content: string;
};

/**
 * Postgres full-text search across note names and bodies for the web
 * (`serverBackend`) workspace, matching the desktop SQLite FTS5 `searchNotes`
 * contract so the web path stops silently degrading to name-only filtering.
 *
 * Ranks matches with `ts_rank` over a combined name+body `tsvector`, boosting
 * name hits, and falls back to `ILIKE` substring matching so partial words the
 * lexeme index misses still surface. Returns ranked `NoteSearchHit`s with a
 * highlighted body excerpt.
 */
export async function searchNotes(query: string, limit = DEFAULT_LIMIT): Promise<NoteSearchHit[]> {
	const trimmed = query.trim();
	if (!trimmed) return [];

	const { prisma, user } = await tryGetAuthenticatedUser();
	if (!user) return [];

	const take = Math.min(Math.max(1, limit), MAX_LIMIT);
	const likePattern = `%${trimmed}%`;

	const rows = await prisma.$queryRaw<NoteSearchRow[]>`
		SELECT n.id, n.name, n.content
		FROM notes n, websearch_to_tsquery('english', ${trimmed}) AS q(query)
		WHERE n.user_id = ${user.id}
			AND n.deleted_at IS NULL
			AND (
				to_tsvector('english', coalesce(n.name, '') || ' ' || coalesce(n.content, '')) @@ q.query
				OR n.name ILIKE ${likePattern}
				OR n.content ILIKE ${likePattern}
			)
		ORDER BY
			ts_rank(
				to_tsvector('english', coalesce(n.name, '') || ' ' || coalesce(n.content, '')),
				q.query
			) DESC,
			(CASE WHEN n.name ILIKE ${likePattern} THEN 1 ELSE 0 END) DESC,
			n.updated_at DESC
		LIMIT ${take}
	`;

	return rows.map((row: NoteSearchRow) => ({
		id: row.id,
		name: row.name,
		snippet: buildSearchSnippet(row.content, trimmed),
	}));
}
