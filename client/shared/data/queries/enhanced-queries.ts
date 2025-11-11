import { useQueryClient as useBaseQueryClient, useQueries as useBaseQueries, useInfiniteQuery as useBaseInfiniteQuery, type UseQueryClient } from "@tanstack/react-query";

/**
 * Enhanced query client with additional utility methods
 */
export function useQueryClient(): UseQueryClient {
  const queryClient = useBaseQueryClient();

  // Enhanced methods could be added here
  return queryClient;
}

/**
 * Enhanced useQueries with better typing and utilities
 */
export function useQueries<T extends any[]>(queries: {
  [K in keyof T]: {
    queryKey: any[];
    queryFn: () => Promise<T[K]>;
    enabled?: boolean;
    staleTime?: number;
    cacheTime?: number;
  };
}) {
  return useBaseQueries(queries as any);
}

/**
 * Enhanced infinite query with standardized options
 */
export function useInfiniteQuery<T>(
  queryKey: any[],
  queryFn: ({ pageParam }: { pageParam?: any }) => Promise<T[]>,
  options: {
    initialPageParam?: any;
    getNextPageParam?: (lastPage: T[], allPages: T[][]) => any;
    getPreviousPageParam?: (firstPage: T[], allPages: T[][]) => any;
    enabled?: boolean;
    staleTime?: number;
    cacheTime?: number;
  } = {}
) {
  const {
    initialPageParam = 0,
    getNextPageParam = (lastPage, allPages) => {
      if (lastPage.length === 0) return undefined;
      return allPages.length;
    },
    getPreviousPageParam = (firstPage, allPages) => {
      if (allPages.length <= 1) return undefined;
      return allPages.length - 2;
    },
    ...restOptions
  } = options;

  return useBaseInfiniteQuery({
    queryKey,
    queryFn,
    initialPageParam,
    getNextPageParam,
    getPreviousPageParam,
    ...restOptions,
  });
}

/**
 * Utility functions for query management
 */
export const queryUtils = {
  /**
   * Invalidate multiple queries in parallel
   */
  invalidateMultiple: (
    queryClient: UseQueryClient,
    filters: Array<{ queryKey: any[]; exact?: boolean }>
  ) => {
    return Promise.all(
      filters.map(filter =>
        queryClient.invalidateQueries({
          queryKey: filter.queryKey,
          exact: filter.exact ?? true,
        })
      )
    );
  },

  /**
   * Cancel multiple queries in parallel
   */
  cancelMultiple: (
    queryClient: UseQueryClient,
    filters: Array<{ queryKey: any[]; exact?: boolean }>
  ) => {
    return Promise.all(
      filters.map(filter =>
        queryClient.cancelQueries({
          queryKey: filter.queryKey,
          exact: filter.exact ?? true,
        })
      )
    );
  },

  /**
   * Prefetch multiple queries in parallel
   */
  prefetchMultiple: async <T>(
    queryClient: UseQueryClient,
    queries: Array<{
      queryKey: any[];
      queryFn: () => Promise<T>;
      staleTime?: number;
    }>
  ) => {
    return Promise.all(
      queries.map(({ queryKey, queryFn, staleTime }) =>
        queryClient.prefetchQuery({
          queryKey,
          queryFn,
          staleTime,
        })
      )
    );
  },

  /**
   * Get query data safely with type checking
   */
  getQueryData: <T>(queryClient: UseQueryClient, queryKey: any[]): T | undefined => {
    return queryClient.getQueryData<T>(queryKey);
  },

  /**
   * Set query data with type safety
   */
  setQueryData: <T>(
    queryClient: UseQueryClient,
    queryKey: any[],
    data: T | ((old: T | undefined) => T)
  ) => {
    queryClient.setQueryData<T>(queryKey, data);
  },

  /**
   * Update query data with a function
   */
  updateQueryData: <T>(
    queryClient: UseQueryClient,
    queryKey: any[],
    updater: (old: T | undefined) => T
  ): T | undefined => {
    let updatedData: T | undefined;

    queryClient.setQueryData<T>(queryKey, (old) => {
      updatedData = updater(old);
      return updatedData;
    });

    return updatedData;
  },

  /**
   * Optimistically update and rollback on error
   */
  optimisticUpdate: async <TVariables, TData>(
    queryClient: UseQueryClient,
    options: {
      queryKey: any[];
      updateFn: (variables: TVariables) => Promise<TData>;
      optimisticFn: (variables: TVariables) => (old: TData | undefined) => TData;
      variables: TVariables;
      rollbackOnError?: boolean;
    }
  ) => {
    const { queryKey, updateFn, optimisticFn, variables, rollbackOnError = true } = options;

    // Store previous data for rollback
    const previousData = queryClient.getQueryData<TData>(queryKey);

    try {
      // Apply optimistic update
      queryClient.setQueryData<TData>(queryKey, optimisticFn(variables));

      // Execute actual update
      const result = await updateFn(variables);

      // Update with real data
      queryClient.setQueryData<TData>(queryKey, result);

      return result;
    } catch (error) {
      // Rollback on error
      if (rollbackOnError && previousData !== undefined) {
        queryClient.setQueryData<TData>(queryKey, previousData);
      }
      throw error;
    }
  },
};

/**
 * Query subscription utilities
 */
export function useQuerySubscription<T>(
  queryKey: any[],
  subscriptionFn: (onData: (data: T) => void) => () => void
) {
  // This could be implemented with real-time subscriptions
  // For now, it's a placeholder for future implementation
}

/**
 * Query performance monitoring
 */
export const queryPerformance = {
  /**
   * Measure query execution time
   */
  measureQuery: async <T>(
    queryFn: () => Promise<T>,
    onMetric?: (duration: number) => void
  ): Promise<T> => {
    const start = performance.now();
    try {
      const result = await queryFn();
      const duration = performance.now() - start;
      onMetric?.(duration);
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      onMetric?.(duration);
      throw error;
    }
  },

  /**
   * Get query cache statistics
   */
  getCacheStats: (queryClient: UseQueryClient) => {
    const cache = queryClient.getQueryCache().getAll();

    return {
      totalQueries: cache.length,
      activeQueries: cache.filter(q => (q as any).observers?.length > 0).length,
      staleQueries: cache.filter(q => q.isStale()).length,
      fetchingQueries: cache.filter(q => q.isFetching()).length,
      totalMemoryUsage: cache.reduce((sum, q) => sum + JSON.stringify(q.state.data).length, 0),
    };
  },
};