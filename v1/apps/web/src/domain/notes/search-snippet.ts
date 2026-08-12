const SNIPPET_MAX_LENGTH = 160;
const SNIPPET_LEAD = 32;

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function queryTerms(query: string): string[] {
	return Array.from(
		new Set(
			query
				.toLowerCase()
				.split(/\s+/)
				.map((term) => term.replace(/[^\p{L}\p{N}]+/gu, ""))
				.filter((term) => term.length > 0),
		),
	);
}

function collapseWhitespace(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

/**
 * Builds a short excerpt of `content` around the first query match, wrapping
 * every matched term in `[` … `]`. Mirrors the desktop SQLite FTS5 snippet
 * contract (`NoteSearchHit.snippet`) so the web search path renders identical
 * highlighted excerpts. Falls back to the leading text when the query only
 * matched the note name.
 */
export function buildSearchSnippet(content: string, query: string): string {
	const flattened = collapseWhitespace(content);
	if (!flattened) return "";

	const terms = queryTerms(query);
	if (terms.length === 0) {
		return flattened.slice(0, SNIPPET_MAX_LENGTH);
	}

	const matcher = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "giu");
	const firstMatch = matcher.exec(flattened);
	matcher.lastIndex = 0;

	const start = firstMatch ? Math.max(0, firstMatch.index - SNIPPET_LEAD) : 0;
	const windowText = flattened.slice(start, start + SNIPPET_MAX_LENGTH);
	const highlighted = windowText.replace(matcher, "[$1]");

	const prefix = start > 0 ? "…" : "";
	const suffix = start + SNIPPET_MAX_LENGTH < flattened.length ? "…" : "";
	return `${prefix}${highlighted}${suffix}`;
}
