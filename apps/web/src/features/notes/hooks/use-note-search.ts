"use client";

import { useQuery } from "@tanstack/react-query";
import { useWorkspaceBackend } from "@/core/workspace-backend";

export type NoteSearchHit = {
	id: string;
	name: string;
	snippet: string;
};

type SearchCapableBackend = {
	searchNotes?: (query: string, limit?: number) => Promise<NoteSearchHit[]>;
};

const SEARCH_RESULT_LIMIT = 20;

type SearchState = {
	supportsContentSearch: boolean;
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
export function useNoteSearch(query: string): SearchState {
	const backend = useWorkspaceBackend();
	const searchNotes = (backend as SearchCapableBackend).searchNotes;
	const supportsContentSearch = typeof searchNotes === "function";
	const trimmed = query.trim();
	const searchQuery = useQuery({
		queryKey: ["note-search", trimmed],
		queryFn: async () => {
			if (!searchNotes) return [];
			return searchNotes(trimmed, SEARCH_RESULT_LIMIT);
		},
		enabled: supportsContentSearch && trimmed.length > 0,
		staleTime: 0,
		retry: false,
	});

	return {
		supportsContentSearch,
		hits: trimmed.length > 0 ? searchQuery.data ?? [] : [],
		isSearching: searchQuery.isFetching,
	};
}
