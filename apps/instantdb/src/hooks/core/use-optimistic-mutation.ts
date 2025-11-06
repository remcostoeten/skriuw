import { useState, useCallback } from 'react';
import { useErrorHandler } from '../use-error-handler';

type OptimisticConfig<TData, TVariables> = {
  mutationFn: (variables: TVariables) => Promise<TData>;
  onOptimistic?: (variables: TVariables) => void;
  onRollback?: (variables: TVariables) => void;
  onSuccess?: (data: TData, variables: TVariables) => void;
  onError?: (error: Error, variables: TVariables) => void;
  showErrorToast?: boolean;
  errorContext?: string;
};

/**
 * Mutation hook with optimistic update support
 * 
 * @example
 * ```ts
 * const { mutate } = useOptimisticMutation({
 *   mutationFn: async ({ id, completed }) => {
 *     await updateTask(id, { completed });
 *   },
 *   onOptimistic: ({ id, completed }) => {
 *     // Update UI immediately
 *     updateTaskInCache(id, { completed });
 *   },
 *   onRollback: ({ id }) => {
 *     // Revert UI on error
 *     revertTaskInCache(id);
 *   },
 * });
 * ```
 */
export function useOptimisticMutation<TData, TVariables>(
  config: OptimisticConfig<TData, TVariables>
) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { handleError } = useErrorHandler({
    showToast: config.showErrorToast !== false,
  });

  const mutate = useCallback(
    async (variables: TVariables) => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Apply optimistic update
        config.onOptimistic?.(variables);
        
        // Perform actual mutation
        const result = await config.mutationFn(variables);
        
        // Success callback
        await config.onSuccess?.(result, variables);
        
        return result;
      } catch (err) {
        const e = err as Error;
        setError(e);
        
        // Rollback optimistic update
        config.onRollback?.(variables);
        
        // Handle error
        if (config.showErrorToast !== false) {
          handleError(e, config.errorContext);
        }
        
        await config.onError?.(e, variables);
        throw e;
      } finally {
        setIsLoading(false);
      }
    },
    [config, handleError]
  );

  const reset = useCallback(() => {
    setError(null);
    setIsLoading(false);
  }, []);

  return { mutate, isLoading, error, reset };
}


