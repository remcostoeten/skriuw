"use client";

import type { QueryClient, QueryKey } from "@tanstack/react-query";

export function createCacheQueryFn<TData>(queryClient: QueryClient, queryKey: QueryKey) {
	return async function queryFromCache(): Promise<TData> {
		const cached = queryClient.getQueryData<TData>(queryKey);
		if (cached !== undefined) {
			return cached;
		}

		throw new Error(`Missing hydrated cache for ${JSON.stringify(queryKey)}`);
	};
}
