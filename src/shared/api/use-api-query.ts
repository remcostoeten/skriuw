"use client";

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";

/**
 * Thin wrapper around TanStack Query's `useQuery`.
 *
 * Prefer {@link useAuthedApiQuery} for user-scoped API data. Use this directly
 * when the query does not depend on authentication (public data, local-only
 * state, or auth is handled inside `queryFn` / `enabled`).
 *
 * @example Public or auth-agnostic query
 * ```ts
 * return useApiQuery(["feature-flags"], () => fetchFeatureFlags(), {
 *   staleTime: 60_000,
 * });
 * ```
 */
export function useApiQuery<TData>(
	queryKey: readonly unknown[],
	queryFn: () => Promise<TData>,
	options?: Omit<UseQueryOptions<TData>, "queryKey" | "queryFn">,
) {
	return useQuery<TData>({
		queryKey,
		queryFn,
		...options,
	});
}
