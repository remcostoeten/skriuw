"use client";

import {
  useMutation,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";

type OptimisticConfig<TInput, TData> = {
  /**
   * Query key(s) to cancel and snapshot before the mutation fires.
   */
  queryKey: QueryKey;
  /**
   * Produce the next cache value from the current cache and the mutation input.
   * Return `undefined` to skip the optimistic write for this key.
   */
  updater: (current: TData | undefined, input: TInput) => TData | undefined;
};

type UseApiMutationOptions<TInput, TOutput, TData = unknown> = {
  /**
   * Query keys to invalidate after a successful mutation.
   * If not provided, defaults to the optimistic query key (if set).
   */
  invalidateKeys?: QueryKey[];
  /**
   * Optional optimistic update config.
   * When provided, the cache is patched immediately and rolled back on error.
   */
  optimistic?: OptimisticConfig<TInput, TData>;
  /**
   * Optional callback fired after a successful mutation.
   */
  onSuccess?: (data: TOutput, input: TInput) => void;
  /**
   * Optional callback fired when the mutation fails.
   */
  onError?: (error: Error, input: TInput) => void;
};

export function useApiMutation<TInput, TOutput = void, TData = unknown>(
  mutationFn: (input: TInput) => Promise<TOutput>,
  options: UseApiMutationOptions<TInput, TOutput, TData> = {},
) {
  const queryClient = useQueryClient();
  const { optimistic, invalidateKeys, onSuccess, onError } = options;

  return useMutation<TOutput, Error, TInput, { previous?: TData }>({
    mutationFn,

    onMutate: optimistic
      ? async (input) => {
          await queryClient.cancelQueries({ queryKey: optimistic.queryKey });

          const previous = queryClient.getQueryData<TData>(
            optimistic.queryKey,
          );

          const next = optimistic.updater(previous, input);
          if (next !== undefined) {
            queryClient.setQueryData(optimistic.queryKey, next);
          }

          return { previous };
        }
      : undefined,

    onError: (error, input, context) => {
      if (optimistic && context?.previous !== undefined) {
        queryClient.setQueryData(optimistic.queryKey, context.previous);
      }

      onError?.(error, input);
    },

    onSuccess: (data, input) => {
      onSuccess?.(data, input);
    },

    onSettled: () => {
      const keys =
        invalidateKeys ??
        (optimistic ? [optimistic.queryKey] : []);

      for (const key of keys) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
}
