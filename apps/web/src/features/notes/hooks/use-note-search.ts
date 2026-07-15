"use client";

import { useQuery } from "@tanstack/react-query";
import { useWorkspaceBackend } from "@/core/workspace-backend";

export type NoteSearchHit = {
	id: string;
	name: string;
	snippet: string;
};

type SearchCapableBackend = {
	searchNotes?: (
		query: string,
		limit?: number,
		options?: { semantic?: boolean },
	) => Promise<NoteSearchHit[]>;
};

const SEARCH_RESULT_LIMIT = 20;

type SearchState = {
	supportsContentSearch: boolean;
	supportsSemanticSearch: boolean;
	hits: NoteSearchHit[];
	isSearching: boolean;
};

/**
 * Content-aware note search backed by the workspace backend's optional
 * `searchNotes` (desktop SQLite FTS5, web Postgres full-text). When the active
 * backend does not implement `searchNotes` (guest mode), `supportsContentSearch`
 * is `false` and the caller should fall back to its in-memory name/tag filter.
 *
 * Debounces the query, ignores stale/out-of-order responses, and never leaves a
 * lingering loading state for an empty query.
 */
export function useNoteSearch(query: string, semantic = false): SearchState {
	const backend = useWorkspaceBackend();
	const searchNotes = (backend as SearchCapableBackend).searchNotes;
	const supportsContentSearch = typeof searchNotes === "function";
	const supportsSemanticSearch = backend.mode === "server";
	const trimmed = query.trim();
	const searchQuery = useQuery({
		queryKey: ["note-search", trimmed, semantic],
		queryFn: async () => {
			if (!searchNotes) return [];
			return searchNotes(trimmed, SEARCH_RESULT_LIMIT, { semantic });
		},
		enabled: supportsContentSearch && trimmed.length > 0,
		staleTime: 0,
		retry: false,
	});

	return {
		supportsContentSearch,
		supportsSemanticSearch,
		hits: trimmed.length > 0 ? (searchQuery.data ?? []) : [],
		isSearching: searchQuery.isFetching,
	};
}
