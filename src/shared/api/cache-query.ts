"use client";

import type { QueryClient, QueryKey } from "@tanstack/react-query";

/**
 * Builds a `queryFn` that reads from the React Query cache instead of the network.
 *
 * Use with {@link useAuthedApiQuery} when server data was prefetched or seeded by
 * a mutation and the hook should stay cache-first. Throws if the key is missing
 * so missing hydration fails loudly during development.
 *
 * @example Cache-first list hook (see `useNotes`)
 * ```ts
 * const queryClient = useQueryClient();
 *
 * return useAuthedApiQuery<NoteFile[]>(
 *   notesKeys.files(),
 *   createCacheQueryFn<NoteFile[]>(queryClient, notesKeys.files()),
 *   { staleTime: Infinity },
 * );
 * ```
 */
export function createCacheQueryFn<TData>(queryClient: QueryClient, queryKey: QueryKey) {
	return async function queryFromCache(): Promise<TData> {
		const cached = queryClient.getQueryData<TData>(queryKey);
		if (cached !== undefined) {
			return cached;
		}

		throw new Error(`Missing hydrated cache for ${JSON.stringify(queryKey)}`);
	};
}
