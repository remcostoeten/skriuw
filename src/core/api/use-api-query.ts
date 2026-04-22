"use client";

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";

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
