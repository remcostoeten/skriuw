import type { QueryKey } from "@tanstack/react-query";
import type { QueryKeys } from "../types";

/**
 * Factory for creating standardized query keys
 */
export function createQueryKeys<T extends string>(entity: T): QueryKeys & { [K in T]: QueryKeys } {
  const base = [entity] as const;

  return {
    all: [...base],
    lists: (filters?: any) => [...base, 'list', ...(filters ? [filters] : [])],
    details: (id: string) => [...base, 'detail', id],
    mutations: () => [...base, 'mutation'],

    // Convenience methods
    list: () => [...base, 'list'],
    detail: (id: string) => [...base, 'detail', id],
    create: () => [...base, 'create'],
    update: (id: string) => [...base, 'update', id],
    delete: (id: string) => [...base, 'delete', id],

    // Nested queries
    search: (query: string) => [...base, 'search', query],
    count: (filters?: any) => [...base, 'count', ...(filters ? [filters] : [])],

    // Cache management
    invalidateAll: () => ({ queryKey: base }),
    invalidateLists: (filters?: any) => ({
      queryKey: [...base, 'list', ...(filters ? [filters] : [])]
    }),
    invalidateDetail: (id: string) => ({
      queryKey: [...base, 'detail', id]
    }),
  } as QueryKeys & { [K in T]: QueryKeys };
}

/**
 * Factory for creating standardized query options
 */
export function createQueryOptions<T>(
  queryKeys: QueryKeys,
  options: {
    staleTime?: number;
    cacheTime?: number;
    refetchOnWindowFocus?: boolean;
    refetchOnReconnect?: boolean;
    retry?: number | boolean;
    retryDelay?: number;
  } = {}
) {
  const {
    staleTime = 1000 * 60 * 5, // 5 minutes
    cacheTime = 1000 * 60 * 30, // 30 minutes
    refetchOnWindowFocus = false,
    refetchOnReconnect = true,
    retry = 3,
    retryDelay = 1000,
  } = options;

  return {
    // List query options
    list: (filters?: any, customOptions = {}) => ({
      queryKey: queryKeys.lists(filters),
      staleTime,
      gcTime: cacheTime,
      refetchOnWindowFocus,
      refetchOnReconnect,
      retry,
      retryDelay,
      ...customOptions,
    }),

    // Detail query options
    detail: (id: string, customOptions = {}) => ({
      queryKey: queryKeys.details(id),
      staleTime,
      gcTime: cacheTime,
      refetchOnWindowFocus,
      refetchOnReconnect,
      retry,
      retryDelay,
      ...customOptions,
    }),

    // Search query options
    search: (query: string, customOptions = {}) => ({
      queryKey: queryKeys.search(query),
      staleTime: 1000 * 60 * 2, // 2 minutes for search
      gcTime: 1000 * 60 * 10, // 10 minutes for search
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
      retryDelay,
      ...customOptions,
    }),

    // Count query options
    count: (filters?: any, customOptions = {}) => ({
      queryKey: queryKeys.count(filters),
      staleTime: 1000 * 60, // 1 minute for counts
      gcTime: 1000 * 60 * 5, // 5 minutes for counts
      refetchOnWindowFocus,
      refetchOnReconnect,
      retry,
      retryDelay,
      ...customOptions,
    }),
  };
}

/**
 * Create entity-specific query factory
 */
export function createEntityQueries<T extends Record<string, any>>(
  entityName: string,
  storage: {
    list: (filters?: any) => Promise<T[]>;
    read: (id: string) => Promise<T | null>;
    search: (query: string) => Promise<T[]>;
    count: (filters?: any) => Promise<number>;
  }
) {
  const queryKeys = createQueryKeys(entityName);
  const queryOptions = createQueryOptions(queryKeys);

  return {
    keys: queryKeys,
    options: queryOptions,

    // Query functions
    queries: {
      list: (filters?: any) => ({
        queryKey: queryKeys.lists(filters),
        queryFn: () => storage.list(filters),
        ...queryOptions.list(filters),
      }),

      detail: (id: string) => ({
        queryKey: queryKeys.details(id),
        queryFn: () => storage.read(id),
        ...queryOptions.detail(id),
      }),

      search: (query: string) => ({
        queryKey: queryKeys.search(query),
        queryFn: () => storage.search(query),
        ...queryOptions.search(query),
        enabled: query.trim().length > 0, // Only enable if query is not empty
      }),

      count: (filters?: any) => ({
        queryKey: queryKeys.count(filters),
        queryFn: () => storage.count(filters),
        ...queryOptions.count(filters),
      }),
    },

    // Mutation query keys for invalidation
    mutations: {
      create: () => queryKeys.mutations(),
      update: (id: string) => queryKeys.update(id),
      delete: (id: string) => queryKeys.delete(id),
    },

    // Cache management helpers
    cache: {
      invalidateAll: () => queryKeys.invalidateAll(),
      invalidateLists: (filters?: any) => queryKeys.invalidateLists(filters),
      invalidateDetail: (id: string) => queryKeys.invalidateDetail(id),
      setListData: (data: T[], filters?: any) => ({
        queryKey: queryKeys.lists(filters),
        data,
      }),
      setDetailData: (id: string, data: T) => ({
        queryKey: queryKeys.details(id),
        data,
      }),
      updateListItem: (id: string, updater: (item: T) => T) => ({
        queryKey: queryKeys.lists(),
        updater: (old: T[] | undefined) => {
          if (!old) return old;
          return old.map(item => item.id === id ? updater(item) : item);
        },
      }),
      removeListItem: (id: string) => ({
        queryKey: queryKeys.lists(),
        updater: (old: T[] | undefined) => {
          if (!old) return old;
          return old.filter(item => item.id !== id);
        },
      }),
      addListItem: (item: T) => ({
        queryKey: queryKeys.lists(),
        updater: (old: T[] | undefined) => {
          if (!old) return [item];
          return [...old, item];
        },
      }),
    },
  };
}

/**
 * Global query keys for app-wide queries
 */
export const globalQueryKeys = {
  // App configuration
  app: createQueryKeys('app'),

  // Settings and feature flags
  settings: createQueryKeys('settings'),
  featureFlags: createQueryKeys('featureFlags'),

  // User and authentication
  user: createQueryKeys('user'),
  auth: createQueryKeys('auth'),

  // System information
  system: createQueryKeys('system'),
  storage: createQueryKeys('storage'),

  // Search and filters
  search: createQueryKeys('search'),
  filters: createQueryKeys('filters'),

  // UI state
  ui: createQueryKeys('ui'),
  layout: createQueryKeys('layout'),

  // Analytics and metrics
  analytics: createQueryKeys('analytics'),
  metrics: createQueryKeys('metrics'),
} as const;