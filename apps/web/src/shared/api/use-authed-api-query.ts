"use client";

import type { UseQueryOptions } from "@tanstack/react-query";
import { useAuth } from "@/core/auth/use-auth";
import { useApiQuery } from "./use-api-query";

/**
 * React Query hook for data that should only load for signed-in users.
 *
 * Wraps {@link useApiQuery} and keeps the query disabled until auth is ready
 * and the session phase is `"authenticated"`. Pass `enabled: false` to add
 * your own guards (e.g. wait for a route param).
 *
 * @example Fetch a note by id once auth and the id are available
 * ```ts
 * export function useNote(noteId: string | null | undefined) {
 *   const id = noteId ?? "";
 *   const queryClient = useQueryClient();
 *
 *   return useAuthedApiQuery<NoteFile | null>(
 *     notesKeys.detail(id),
 *     async () => {
 *       const cached = queryClient.getQueryData<NoteFile | null>(notesKeys.detail(id));
 *       if (cached !== undefined) return cached;
 *       return fetchNote(id);
 *     },
 *     {
 *       enabled: Boolean(id),
 *       staleTime: Infinity,
 *     },
 *   );
 * }
 * ```
 *
 * @example Read already-hydrated list data from the React Query cache
 * ```ts
 * export function useNotes() {
 *   const queryClient = useQueryClient();
 *
 *   return useAuthedApiQuery<NoteFile[]>(
 *     notesKeys.files(),
 *     createCacheQueryFn<NoteFile[]>(queryClient, notesKeys.files()),
 *     { staleTime: Infinity },
 *   );
 * }
 * ```
 */
export function useAuthedApiQuery<TData>(
	queryKey: readonly unknown[],
	queryFn: () => Promise<TData>,
	options?: Omit<UseQueryOptions<TData>, "queryKey" | "queryFn">,
) {
	const auth = useAuth();
	const enabled = options?.enabled ?? true;

	return useApiQuery<TData>(queryKey, queryFn, {
		...options,
		enabled: auth.isReady && auth.phase === "authenticated" && enabled,
	});
}
