"use server";

import { Prisma } from "@/generated/prisma/client";
import { tryGetAuthenticatedUser } from "@/core/db";
import type { NoteSearchHit } from "@/core/workspace-backend/types";
import { parseSearchQuery } from "@/domain/notes/search-query";
import { buildSearchSnippet } from "@/domain/notes/search-snippet";
import {
	cosineSimilarity,
	createNoteEmbedding,
	type SemanticSearchConfig,
} from "@/features/notes/server/semantic-embeddings";
import type { NoteSearchOptions } from "@/core/workspace-backend/types";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

type NoteSearchRow = {
	id: string;
	name: string;
	content: string;
	semanticEmbedding?: unknown;
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
export async function searchNotes(
	query: string,
	limit = DEFAULT_LIMIT,
	options: NoteSearchOptions = {},
): Promise<NoteSearchHit[]> {
	const { text, tags, people } = parseSearchQuery(query);
	if (!text && tags.length === 0 && people.length === 0) return [];

	const { prisma, user } = await tryGetAuthenticatedUser();
	if (!user) return [];

	const take = Math.min(Math.max(1, limit), MAX_LIMIT);
	const userRecord = await prisma.user.findUnique({
		where: { id: user.id },
		select: { editorPreferences: true },
	});
	const semanticConfig = ((userRecord?.editorPreferences as { ai?: SemanticSearchConfig } | null)
		?.ai ?? {
		provider: "google",
	}) as SemanticSearchConfig;

	// `tag:foo`/`#foo` operators AND-filter on the persisted note_links tag rows.
	const tagFilter = tags.length
		? Prisma.sql`AND NOT EXISTS (
				SELECT 1 FROM unnest(${tags}::text[]) AS wanted(tag)
				WHERE NOT EXISTS (
					SELECT 1 FROM note_links l
					WHERE l.source_note_id = n.id AND l.kind = 'tag' AND l.target_label = wanted.tag
				)
			)`
		: Prisma.empty;

	// `person:ann`/`$ann` operators AND-filter on person link rows, which store
	// person ids — join people to match by name fragment, case-insensitively.
	const personFilter = people.length
		? Prisma.sql`AND NOT EXISTS (
				SELECT 1 FROM unnest(${people}::text[]) AS wanted(fragment)
				WHERE NOT EXISTS (
					SELECT 1 FROM note_links l
					JOIN people p ON p.id::text = l.target_label
					WHERE l.source_note_id = n.id AND l.kind = 'person'
						AND LOWER(p.name) LIKE '%' || wanted.fragment || '%'
				)
			)`
		: Prisma.empty;

	if (options.semantic && text) {
		const queryEmbedding = await createNoteEmbedding("search", text, semanticConfig);
		if (queryEmbedding) {
			const rows = await prisma.$queryRaw<NoteSearchRow[]>`
				SELECT n.id, n.name, n.content, n.semantic_embedding AS "semanticEmbedding"
				FROM notes n
				WHERE n.user_id = ${user.id} AND n.deleted_at IS NULL
				${tagFilter} ${personFilter}
				AND n.semantic_embedding IS NOT NULL
				ORDER BY n.updated_at DESC LIMIT 500
			`;
			const ranked = rows
				.map((row) => ({
					row,
					score: cosineSimilarity(
						queryEmbedding,
						Array.isArray(row.semanticEmbedding) ? row.semanticEmbedding : [],
					),
				}))
				.filter(({ score }) => score > 0.25)
				.sort((a, b) => b.score - a.score)
				.slice(0, take)
				.map(({ row }) => ({
					id: row.id,
					name: row.name,
					snippet: row.content.slice(0, 120),
				}));
			if (ranked.length > 0) return ranked;
		}
	}

	const likePattern = `%${text}%`;

	const rows = text
		? await prisma.$queryRaw<NoteSearchRow[]>`
			SELECT n.id, n.name, n.content
			FROM notes n, websearch_to_tsquery('english', ${text}) AS q(query)
			WHERE n.user_id = ${user.id}
				AND n.deleted_at IS NULL
				${tagFilter}
				${personFilter}
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
		`
		: await prisma.$queryRaw<NoteSearchRow[]>`
			SELECT n.id, n.name, n.content
			FROM notes n
			WHERE n.user_id = ${user.id}
				AND n.deleted_at IS NULL
				${tagFilter}
				${personFilter}
			ORDER BY n.updated_at DESC
			LIMIT ${take}
		`;

	return rows.map((row: NoteSearchRow) => ({
		id: row.id,
		name: row.name,
		snippet: text ? buildSearchSnippet(row.content, text) : row.content.slice(0, 120),
	}));
}
