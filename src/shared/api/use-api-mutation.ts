"use client";

import {
	useMutation,
	useQueryClient,
	type QueryClient,
	type QueryKey,
} from "@tanstack/react-query";

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
	token: number;
	keyHash: string;
};

type OptimisticMutationContext = {
	queryKeys: QueryKey[];
	snapshots: OptimisticSnapshot[];
};

const optimisticKeyTokensByClient = new WeakMap<QueryClient, Map<string, number>>();
let optimisticMutationToken = 0;

function getKeyHash(queryKey: QueryKey): string {
	return JSON.stringify(queryKey);
}

function getOptimisticKeyTokens(queryClient: QueryClient): Map<string, number> {
	const existing = optimisticKeyTokensByClient.get(queryClient);
	if (existing) {
		return existing;
	}

	const created = new Map<string, number>();
	optimisticKeyTokensByClient.set(queryClient, created);
	return created;
}

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

/**
 * React Query mutation with optional optimistic cache updates and invalidation.
 *
 * When `optimistic` is set, matching queries are cancelled, patched immediately,
 * and rolled back on error. On settle, `invalidateKeys` (or the optimistic keys)
 * are invalidated so server state can reconcile.
 *
 * @example Optimistic note update with multi-key cache patches
 * ```ts
 * return useApiMutation<UpdateNoteInput, SaveNoteResult>(
 *   updateNote,
 *   {
 *     invalidateKeys: [],
 *     onSuccess: (result, input) => {
 *       reconcileSavedNoteCache(queryClient, input, result);
 *     },
 *     optimistic: {
 *       updates: [
 *         {
 *           queryKey: notesKeys.files(),
 *           updater: (current: NoteFile[] | undefined, input) =>
 *             (current ?? []).map((note) =>
 *               note.id === input.id ? applyNoteUpdate(note, input) : note,
 *             ),
 *         },
 *         {
 *           queryKey: (input) => notesKeys.detail(input.id),
 *           updater: (current, input) =>
 *             current ? applyNoteUpdate(current, input) : current,
 *         },
 *       ],
 *     },
 *   },
 * );
 * ```
 */
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
					const keyTokens = getOptimisticKeyTokens(queryClient);
					const mutationToken = ++optimisticMutationToken;

					await Promise.all(
						updates.map(({ queryKey }) => queryClient.cancelQueries({ queryKey })),
					);

					const snapshots = updates.map(({ queryKey }) => ({
						keyHash: getKeyHash(queryKey),
						token: mutationToken,
						queryKey,
						previous: queryClient.getQueryData(queryKey),
						hadQuery: queryClient.getQueryState(queryKey) !== undefined,
					}));

					for (const { queryKey, updater } of updates) {
						keyTokens.set(getKeyHash(queryKey), mutationToken);
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
				const keyTokens = getOptimisticKeyTokens(queryClient);

				for (const snapshot of context?.snapshots ?? []) {
					if (keyTokens.get(snapshot.keyHash) !== snapshot.token) {
						continue;
					}

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
			const keyTokens = getOptimisticKeyTokens(queryClient);

			for (const key of keys) {
				void queryClient.invalidateQueries({ queryKey: key });
			}

			for (const snapshot of context?.snapshots ?? []) {
				if (keyTokens.get(snapshot.keyHash) === snapshot.token) {
					keyTokens.delete(snapshot.keyHash);
				}
			}
		},
	});
}
