"use client";

import { useEffect, useRef, useState } from "react";
import { useWorkspaceBackend } from "@/core/workspace-backend";

export type NoteSearchHit = {
	id: string;
	name: string;
	snippet: string;
};

type SearchCapableBackend = {
	searchNotes?: (query: string, limit?: number) => Promise<NoteSearchHit[]>;
};

const SEARCH_DEBOUNCE_MS = 150;
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

	const [hits, setHits] = useState<NoteSearchHit[]>([]);
	const [isSearching, setIsSearching] = useState(false);
	const requestIdRef = useRef(0);

	useEffect(() => {
		if (!supportsContentSearch || !searchNotes) {
			return;
		}

		const trimmed = query.trim();
		if (!trimmed) {
			requestIdRef.current += 1;
			setHits([]);
			setIsSearching(false);
			return;
		}

		const requestId = ++requestIdRef.current;
		setIsSearching(true);

		const timer = setTimeout(() => {
			searchNotes(trimmed, SEARCH_RESULT_LIMIT)
				.then((results) => {
					if (requestId !== requestIdRef.current) {
						return;
					}
					setHits(results);
					setIsSearching(false);
				})
				.catch(() => {
					if (requestId !== requestIdRef.current) {
						return;
					}
					setHits([]);
					setIsSearching(false);
				});
		}, SEARCH_DEBOUNCE_MS);

		return () => {
			clearTimeout(timer);
		};
	}, [query, searchNotes, supportsContentSearch]);

	return { supportsContentSearch, hits, isSearching };
}
