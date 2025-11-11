import { useTransition, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CRUDConfig,
  ReadResult,
  CRUDResult
} from "../types";

/**
 * Unified read operation with caching and transitions
 */
export function useRead<T extends any>(
  id: string,
  config: CRUDConfig<T>
): CRUDResult<T> {
  const [isPending, startTransition] = useTransition();
  const queryClient = useQueryClient();

  const {
    data,
    isLoading: queryLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: [...config.cache?.queryKey || [config.entityName], 'detail', id],
    queryFn: async (): Promise<ReadResult<T>> => {
      try {
        const result = await config.storage.read(id);

        return {
          data: result,
          success: true,
        };
      } catch (err) {
        return {
          data: null,
          success: false,
          error: err instanceof Error ? err.message : 'Read failed',
        };
      }
    },

    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 30, // 30 minutes

    // Optimistic updates handling
    initialData: () => {
      if (config.cache?.getQueryData) {
        return config.cache.getQueryData(id);
      }
      return undefined;
    },
  });

  const refetchWithTransition = useCallback(() => {
    startTransition(() => {
      refetch();
    });
  }, [refetch, startTransition]);

  // Check if we have optimistic data
  const isOptimistic = config.cache?.getQueryData &&
    config.cache.getQueryData(id)?.id?.toString().startsWith('temp-');

  return {
    data: data?.data || null,
    isLoading: queryLoading,
    error: error?.message || data?.error || null,
    isOptimistic: isOptimistic || false,
    transition: {
      isPending,
      startTransition,
    },
    refetch: refetchWithTransition,
  } as CRUDResult<T>;
}

/**
 * Hook for reading lists of entities
 */
export function useReadList<T extends any>(
  filters?: any,
  config?: CRUDConfig<T>
) {
  const [isPending, startTransition] = useTransition();

  const {
    data,
    isLoading: queryLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: config?.cache?.queryKey || ['list'],
    queryFn: async (): Promise<{ data: T[]; totalCount: number }> => {
      if (!config) {
        return { data: [], totalCount: 0 };
      }

      try {
        const result = await config.storage.list(filters);

        return {
          data: result,
          totalCount: result.length,
        };
      } catch (err) {
        return {
          data: [],
          totalCount: 0,
        };
      }
    },

    staleTime: 1000 * 60 * 2, // 2 minutes for lists
    gcTime: 1000 * 60 * 15, // 15 minutes
  });

  const refetchWithTransition = useCallback(() => {
    startTransition(() => {
      refetch();
    });
  }, [refetch, startTransition]);

  return {
    data: data?.data || [],
    totalCount: data?.totalCount || 0,
    isLoading: queryLoading,
    error: error?.message || null,
    refetch: refetchWithTransition,
    isPending,
  };
}