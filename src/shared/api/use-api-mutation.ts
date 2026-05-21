"use client";

import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";

type OptimisticQueryKey<TInput> = QueryKey | ((input: TInput) => QueryKey);

type OptimisticUpdater<TInput, TData> = {
	bivarianceHack(current: TData | undefined, input: TInput): TData | undefined;
}["bivarianceHack"];

type OptimisticUpdate<TInput, TData = unknown> = {
	/**
	 * Query key(s) to cancel and snapshot before the mutation fires.
	 */
	queryKey: OptimisticQueryKey<TInput>;
	/**
	 * Produce the next cache value from the current cache and the mutation input.
	 * Return `undefined` to skip the optimistic write for this key.
	 */
	updater: OptimisticUpdater<TInput, TData>;
};

type OptimisticConfig<TInput, TData> =
	| OptimisticUpdate<TInput, TData>
	| {
			/**
			 * Multiple query caches to cancel, snapshot, patch, and roll back together.
			 */
			updates: readonly OptimisticUpdate<TInput>[];
	  };

type OptimisticSnapshot = {
	queryKey: QueryKey;
	previous: unknown;
	hadQuery: boolean;
};

type OptimisticMutationContext = {
	queryKeys: QueryKey[];
	snapshots: OptimisticSnapshot[];
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

	const getOptimisticUpdates = (input: TInput) =>
		optimistic
			? ("updates" in optimistic ? optimistic.updates : [optimistic]).map((update) => ({
					queryKey:
						typeof update.queryKey === "function"
							? update.queryKey(input)
							: update.queryKey,
					updater: update.updater,
				}))
			: [];

	return useMutation<TOutput, Error, TInput, OptimisticMutationContext>({
		mutationFn,

		onMutate: optimistic
			? async (input) => {
					const updates = getOptimisticUpdates(input);

					await Promise.all(
						updates.map(({ queryKey }) => queryClient.cancelQueries({ queryKey })),
					);

					const snapshots = updates.map(({ queryKey }) => ({
						queryKey,
						previous: queryClient.getQueryData(queryKey),
						hadQuery: queryClient.getQueryState(queryKey) !== undefined,
					}));

					for (const { queryKey, updater } of updates) {
						const previous = queryClient.getQueryData(queryKey);
						const next = updater(previous, input);
						if (next !== undefined) {
							queryClient.setQueryData(queryKey, next);
						}
					}

					return {
						queryKeys: updates.map(({ queryKey }) => queryKey),
						snapshots,
					};
				}
			: undefined,

		onError: (error, input, context) => {
			if (optimistic) {
				for (const snapshot of context?.snapshots ?? []) {
					if (snapshot.hadQuery) {
						queryClient.setQueryData(snapshot.queryKey, snapshot.previous);
					} else {
						queryClient.removeQueries({
							queryKey: snapshot.queryKey,
							exact: true,
						});
					}
				}
			}

			onError?.(error, input);
		},

		onSuccess: (data, input) => {
			onSuccess?.(data, input);
		},

		onSettled: (_data, _error, _input, context) => {
			const keys = invalidateKeys ?? context?.queryKeys ?? [];

			for (const key of keys) {
				void queryClient.invalidateQueries({ queryKey: key });
			}
		},
	});
}
