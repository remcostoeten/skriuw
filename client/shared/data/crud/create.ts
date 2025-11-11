import { useTransition, useCallback } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import type {
  CRUDConfig,
  CreateResult,
  MutationOptions,
  OptimisticUpdate
} from "../types";

/**
 * Unified create operation with optimistic updates
 */
export function useCreate<T extends any>(
  config: CRUDConfig<T>
) {
  const [isPending, startTransition] = useTransition();
  const queryClient = useQueryClient();

  const optimisticUpdates = new Map<string, OptimisticUpdate<T>>();

  const createMutation = useMutation({
    mutationFn: async (data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<CreateResult<T>> => {
      try {
        // Validation
        if (config.validation?.create) {
          const isValid = await config.validation.create(data);
          if (!isValid) {
            throw new Error('Validation failed');
          }
        }

        // Create the entity
        const result = await config.storage.create(data as any);

        return {
          data: result,
          success: true,
        };
      } catch (error) {
        return {
          data: null as any,
          success: false,
          error: error instanceof Error ? error.message : 'Create failed',
        };
      }
    },

    onMutate: async (variables) => {
      // Handle optimistic updates
      if (config.optimistic?.enabled) {
        const tempId = `temp-${Date.now()}`;
        const optimisticData: T = {
          ...variables as any,
          id: tempId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        } as T;

        // Store optimistic update
        optimisticUpdates.set(tempId, {
          id: tempId,
          type: 'create',
          data: optimisticData,
          timestamp: Date.now(),
        });

        // Update cache immediately
        if (config.cache) {
          config.cache.setQueryData(tempId, optimisticData);

          // Update list cache
          const currentList = queryClient.getQueryData(config.cache.queryKey) as T[] || [];
          queryClient.setQueryData(config.cache.queryKey, [...currentList, optimisticData]);
        }

        return { optimisticData, tempId };
      }
    },

    onSuccess: (result, variables, context) => {
      if (result.success && config.cache) {
        // Replace optimistic data with real data
        if (context?.optimisticData) {
          // Update the temporary entry with real data
          config.cache.setQueryData(result.data.id, result.data);

          // Update list cache
          const currentList = queryClient.getQueryData(config.cache.queryKey) as T[] || [];
          const newList = currentList.map(item =>
            item.id === context.tempId ? result.data : item
          );
          queryClient.setQueryData(config.cache.queryKey, newList);
        }
      }

      // Invalidate related queries
      if (config.cache?.invalidateQueries) {
        config.cache.invalidateQueries();
      }
    },

    onError: (error, variables, context) => {
      // Rollback optimistic update
      if (context?.optimisticData && config.cache) {
        // Remove from list cache
        const currentList = queryClient.getQueryData(config.cache.queryKey) as T[] || [];
        const newList = currentList.filter(item => item.id !== context.tempId);
        queryClient.setQueryData(config.cache.queryKey, newList);
      }
    },

    onSettled: () => {
      // Clean up old optimistic updates
      const now = Date.now();
      const maxAge = config.optimistic?.maxAge || 5000; // 5 seconds default

      for (const [key, update] of optimisticUpdates.entries()) {
        if (now - update.timestamp > maxAge) {
          optimisticUpdates.delete(key);
        }
      }
    },
  });

  const create = useCallback((data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>, options?: MutationOptions<T, Error, typeof data>) => {
    startTransition(async () => {
      try {
        const result = await createMutation.mutateAsync(data);

        if (options?.onSuccess && result.success) {
          options.onSuccess(result.data, data);
        }

        if (options?.onError && !result.success) {
          options.onError(new Error(result.error), data);
        }

        if (options?.onSettled) {
          options.onSettled(result.success ? result.data : undefined, result.success ? null : new Error(result.error), data);
        }
      } catch (error) {
        if (options?.onError) {
          options.onError(error as Error, data);
        }

        if (options?.onSettled) {
          options.onSettled(undefined, error as Error, data);
        }
      }
    });
  }, [createMutation, startTransition]);

  return {
    create,
    isLoading: createMutation.isPending,
    isPending,
    error: createMutation.error?.message || null,
    data: createMutation.data,
    optimisticUpdates: Array.from(optimisticUpdates.values()),
  };
}