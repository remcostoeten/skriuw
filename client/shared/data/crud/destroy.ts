import { useTransition, useCallback } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import type {
  CRUDConfig,
  DeleteResult,
  MutationOptions,
  OptimisticUpdate
} from "../types";

/**
 * Unified delete operation with optimistic updates
 */
export function useDelete<T extends any>(
  config: CRUDConfig<T>
) {
  const [isPending, startTransition] = useTransition();
  const queryClient = useQueryClient();

  const optimisticUpdates = new Map<string, OptimisticUpdate<T>>();

  const deleteMutation = useMutation({
    mutationFn: async (id: string): Promise<DeleteResult> => {
      try {
        const result = await config.storage.delete(id);

        return {
          success: result,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Delete failed',
        };
      }
    },

    onMutate: async (id) => {
      // Handle optimistic updates
      if (config.optimistic?.enabled && config.cache?.getQueryData) {
        const previousData = config.cache.getQueryData(id);

        if (previousData) {
          // Store optimistic update for rollback
          optimisticUpdates.set(id, {
            id,
            type: 'delete',
            previousData,
            timestamp: Date.now(),
          });

          // Remove from cache immediately
          if (config.cache.queryKey) {
            const currentList = queryClient.getQueryData(config.cache.queryKey) as T[] || [];
            const newList = currentList.filter(item => item.id !== id);
            queryClient.setQueryData(config.cache.queryKey, newList);
          }

          return { previousData };
        }
      }
    },

    onSuccess: (result, id, context) => {
      if (result.success) {
        // Remove from cache permanently
        if (config.cache) {
          // Query cache will be automatically invalidated
        }

        // Invalidate related queries
        if (config.cache?.invalidateQueries) {
          config.cache.invalidateQueries();
        }
      }
    },

    onError: (error, id, context) => {
      // Rollback optimistic update
      if (context?.previousData && config.cache) {
        // Restore to list cache
        if (config.cache.queryKey) {
          const currentList = queryClient.getQueryData(config.cache.queryKey) as T[] || [];
          const newList = [...currentList, context.previousData];
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

  const deleteItem = useCallback((id: string, options?: MutationOptions<void, Error, string>) => {
    startTransition(async () => {
      try {
        const result = await deleteMutation.mutateAsync(id);

        if (options?.onSuccess && result.success) {
          options.onSuccess(undefined, id);
        }

        if (options?.onError && !result.success) {
          options.onError(new Error(result.error || 'Delete failed'), id);
        }

        if (options?.onSettled) {
          options.onSettled(undefined, result.success ? null : new Error(result.error || 'Delete failed'), id);
        }
      } catch (error) {
        if (options?.onError) {
          options.onError(error as Error, id);
        }

        if (options?.onSettled) {
          options.onSettled(undefined, error as Error, id);
        }
      }
    });
  }, [deleteMutation, startTransition]);

  const batchDelete = useCallback((
    ids: string[],
    options?: MutationOptions<void, Error, string[]>
  ) => {
    startTransition(async () => {
      try {
        const results = await Promise.allSettled(
          ids.map(id => deleteMutation.mutateAsync(id))
        );

        const successfulDeletes = results.filter((result) => {
          if (result.status === 'fulfilled') {
            return result.value.success;
          }
          return false;
        }).length;

        const failedDeletes = results.length - successfulDeletes;

        if (failedDeletes === 0 && options?.onSuccess) {
          options.onSuccess(undefined, ids);
        }

        if (failedDeletes > 0 && options?.onError) {
          options.onError(new Error(`${failedDeletes} deletions failed`), ids);
        }

        if (options?.onSettled) {
          options.onSettled(
            undefined,
            failedDeletes > 0 ? new Error('Some deletions failed') : null,
            ids
          );
        }
      } catch (error) {
        if (options?.onError) {
          options.onError(error as Error, ids);
        }

        if (options?.onSettled) {
          options.onSettled(undefined, error as Error, ids);
        }
      }
    });
  }, [deleteMutation, startTransition]);

  const deleteWithConfirmation = useCallback((
    id: string,
    confirmMessage: string = 'Are you sure you want to delete this item?',
    options?: MutationOptions<void, Error, string>
  ) => {
    startTransition(async () => {
      try {
        // Show confirmation dialog
        const confirmed = window.confirm(confirmMessage);
        if (!confirmed) {
          return;
        }

        await deleteItem(id, options);
      } catch (error) {
        if (options?.onError) {
          options.onError(error as Error, id);
        }
      }
    });
  }, [deleteItem, startTransition]);

  return {
    deleteItem,
    batchDelete,
    deleteWithConfirmation,
    isLoading: deleteMutation.isPending,
    isPending,
    error: deleteMutation.error?.message || null,
    data: deleteMutation.data,
    optimisticUpdates: Array.from(optimisticUpdates.values()),
  };
}