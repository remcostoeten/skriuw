import { useTransition, useCallback } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import type {
  CRUDConfig,
  UpdateResult,
  MutationOptions,
  OptimisticUpdate
} from "../types";

/**
 * Unified update operation with optimistic updates
 */
export function useUpdate<T extends any>(
  config: CRUDConfig<T>
) {
  const [isPending, startTransition] = useTransition();
  const queryClient = useQueryClient();

  const optimisticUpdates = new Map<string, OptimisticUpdate<T>>();

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<T> }): Promise<UpdateResult<T>> => {
      try {
        // Validation
        if (config.validation?.update) {
          const isValid = await config.validation.update(data);
          if (!isValid) {
            throw new Error('Validation failed');
          }
        }

        // Update the entity
        const result = await config.storage.update(id, data);

        if (!result) {
          throw new Error('Entity not found');
        }

        return {
          data: result,
          success: true,
        };
      } catch (error) {
        return {
          data: null as any,
          success: false,
          error: error instanceof Error ? error.message : 'Update failed',
        };
      }
    },

    onMutate: async ({ id, data }) => {
      // Handle optimistic updates
      if (config.optimistic?.enabled && config.cache?.getQueryData) {
        const previousData = config.cache.getQueryData(id);

        if (previousData) {
          const optimisticData: T = {
            ...previousData,
            ...data,
            updatedAt: Date.now(),
          };

          // Store optimistic update for rollback
          optimisticUpdates.set(id, {
            id,
            type: 'update',
            data: optimisticData,
            previousData,
            timestamp: Date.now(),
          });

          // Update cache immediately
          config.cache.setQueryData(id, optimisticData);

          // Update list cache if exists
          if (config.cache.queryKey) {
            const currentList = queryClient.getQueryData(config.cache.queryKey) as T[] || [];
            const newList = currentList.map(item =>
              item.id === id ? optimisticData : item
            );
            queryClient.setQueryData(config.cache.queryKey, newList);
          }

          return { previousData, optimisticData };
        }
      }
    },

    onSuccess: (result, variables, context) => {
      if (result.success && config.cache) {
        // Update cache with real data
        config.cache.setQueryData(variables.id, result.data);

        // Update list cache
        if (config.cache.queryKey) {
          const currentList = queryClient.getQueryData(config.cache.queryKey) as T[] || [];
          const newList = currentList.map(item =>
            item.id === variables.id ? result.data : item
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
      if (context?.previousData && config.cache) {
        config.cache.setQueryData(variables.id, context.previousData);

        // Update list cache
        if (config.cache.queryKey) {
          const currentList = queryClient.getQueryData(config.cache.queryKey) as T[] || [];
          const newList = currentList.map(item =>
            item.id === variables.id ? context.previousData : item
          );
          queryClient.setQueryData(config.cache.queryKey, newList);
        }
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

  const update = useCallback((
    id: string,
    data: Partial<T>,
    options?: MutationOptions<T, Error, { id: string; data: Partial<T> }>
  ) => {
    startTransition(async () => {
      try {
        const result = await updateMutation.mutateAsync({ id, data });

        if (options?.onSuccess && result.success) {
          options.onSuccess(result.data, { id, data });
        }

        if (options?.onError && !result.success) {
          options.onError(new Error(result.error), { id, data });
        }

        if (options?.onSettled) {
          options.onSettled(result.success ? result.data : undefined, result.success ? null : new Error(result.error), { id, data });
        }
      } catch (error) {
        if (options?.onError) {
          options.onError(error as Error, { id, data });
        }

        if (options?.onSettled) {
          options.onSettled(undefined, error as Error, { id, data });
        }
      }
    });
  }, [updateMutation, startTransition]);

  const batchUpdate = useCallback((
    updates: Array<{ id: string; data: Partial<T> }>,
    options?: MutationOptions<T[], Error, Array<{ id: string; data: Partial<T> }>>
  ) => {
    startTransition(async () => {
      try {
        const results = await Promise.allSettled(
          updates.map(({ id, data }) => updateMutation.mutateAsync({ id, data }))
        );

        const successfulResults = results
          .filter((result): result is PromiseFulfilledResult<UpdateResult<T>> =>
            result.status === 'fulfilled' && result.value.success
          )
          .map(result => result.value.data);

        const failedResults = results
          .filter((result): result is PromiseRejectedResult | PromiseFulfilledResult<UpdateResult<T>> =>
            result.status === 'rejected' || (result.status === 'fulfilled' && !result.value.success)
          );

        if (failedResults.length === 0 && options?.onSuccess) {
          options.onSuccess(successfulResults, updates);
        }

        if (failedResults.length > 0 && options?.onError) {
          options.onError(new Error(`${failedResults.length} updates failed`), updates);
        }

        if (options?.onSettled) {
          options.onSettled(successfulResults, failedResults.length > 0 ? new Error('Some updates failed') : null, updates);
        }
      } catch (error) {
        if (options?.onError) {
          options.onError(error as Error, updates);
        }

        if (options?.onSettled) {
          options.onSettled(undefined, error as Error, updates);
        }
      }
    });
  }, [updateMutation, startTransition]);

  return {
    update,
    batchUpdate,
    isLoading: updateMutation.isPending,
    isPending,
    error: updateMutation.error?.message || null,
    data: updateMutation.data,
    optimisticUpdates: Array.from(optimisticUpdates.values()),
  };
}