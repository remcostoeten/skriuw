import { useCallback, useState } from 'react';

/** Options for `useMutation`. */
export interface UseMutationOptions<TData, TVariables> {
  /** Callback executed on successful mutation. */
  onSuccess?: (data: TData, variables: TVariables) => void | Promise<void>;
  /** Callback executed on error. */
  onError?: (error: Error, variables: TVariables) => void | Promise<void>;
  /** Whether to show toast notifications on error. */
  showErrorToast?: boolean;
  /** Context for error messages. */
  errorContext?: string;
}

/**
 * Wraps an async mutation function and returns `{ mutate, isLoading, error, reset }`.
 */
export function useMutation<TData, TVariables = void>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options?: UseMutationOptions<TData, TVariables>
) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = useCallback(
    async (variables: TVariables) => {
      try {
        setIsLoading(true);
        setError(null);
        const result = await mutationFn(variables);
        await options?.onSuccess?.(result, variables);
        return result;
      } catch (err) {
        const e = err as Error;
        setError(e);

        // Handle error with toast notification if enabled
        if (options?.showErrorToast !== false) {
          // Import dynamically to avoid circular dependencies
          import('@/hooks/use-error-handler').then(({ useErrorHandler }) => {
            const { handleError } = useErrorHandler();
            handleError(e, options?.errorContext);
          });
        }

        await options?.onError?.(e, variables);
        throw e;
      } finally {
        setIsLoading(false);
      }
    },
    [mutationFn, options]
  );

  const reset = useCallback(() => {
    setError(null);
    setIsLoading(false);
  }, []);

  return { mutate, isLoading, error, reset } as const;
}



