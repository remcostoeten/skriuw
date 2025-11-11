import { useQueryClient } from "@tanstack/react-query";
import type { CRUDConfig } from "../types";
import { useCreate } from "./create";
import { useRead } from "./read";
import { useUpdate } from "./update";
import { useDelete } from "./delete";

/**
 * Unified CRUD hook that combines all CRUD operations
 */
export function useCRUD<T extends any>(config: CRUDConfig<T>) {
  const queryClient = useQueryClient();

  // Create cache helpers if not provided
  const cacheConfig = config.cache || {
    queryKey: [config.entityName],
    invalidateQueries: () => {
      queryClient.invalidateQueries({ queryKey: [config.entityName] });
    },
    setQueryData: (id: string, data: T) => {
      queryClient.setQueryData([config.entityName, 'detail', id], data);
    },
    getQueryData: (id: string) => {
      return queryClient.getQueryData<T>([config.entityName, 'detail', id]);
    },
  };

  const enhancedConfig = {
    ...config,
    cache: cacheConfig,
  };

  // Individual operations
  const create = useCreate<T>(enhancedConfig);
  const update = useUpdate<T>(enhancedConfig);
  const deleteOp = useDelete<T>(enhancedConfig);

  // Read operations need to be called with specific params
  const read = (id: string) => {
    const hook = useRead<T>(id, enhancedConfig);
    return hook;
  };
  const readList = (filters?: any) => {
    const hook = useReadList<T>(filters, enhancedConfig);
    return hook;
  };

  // Utility methods
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: [config.entityName] });
  };

  const prefetch = async (id: string) => {
    await queryClient.prefetchQuery({
      queryKey: [config.entityName, 'detail', id],
      queryFn: () => config.storage.read(id),
    });
  };

  const getOptimisticUpdates = () => {
    return [
      ...create.optimisticUpdates,
      ...update.optimisticUpdates,
      ...deleteOp.optimisticUpdates,
    ];
  };

  const isAnyOperationPending = create.isLoading || update.isLoading || deleteOp.isLoading;
  const isAnyTransitionPending = create.isPending || update.isPending || deleteOp.isPending;

  return {
    // CRUD operations
    create: create.create,
    read,
    readList,
    update: update.update,
    batchUpdate: update.batchUpdate,
    deleteItem: deleteOp.deleteItem,
    batchDelete: deleteOp.batchDelete,
    deleteWithConfirmation: deleteOp.deleteWithConfirmation,

    // Loading states
    isLoading: isAnyOperationPending,
    isTransitionPending: isAnyTransitionPending,

    // Errors
    errors: {
      create: create.error,
      update: update.error,
      delete: deleteOp.error,
    },

    // Optimistic updates
    optimisticUpdates: getOptimisticUpdates(),

    // Utilities
    invalidateAll,
    prefetch,

    // Raw hooks for advanced usage
    hooks: {
      create,
      update,
      delete: deleteOp,
    },

    // Config
    config: enhancedConfig,
  };
}

/**
 * Type-safe factory function for creating CRUD configs
 */
export function createCRUDConfig<T extends any>(
  entityName: string,
  storage: CRUDConfig<T>['storage'],
  options?: Partial<Omit<CRUDConfig<T>, 'entityName' | 'storage'>>
): CRUDConfig<T> {
  return {
    entityName,
    storage,
    optimistic: {
      enabled: true,
      maxAge: 5000,
      ...options?.optimistic,
    },
    ...options,
  };
}