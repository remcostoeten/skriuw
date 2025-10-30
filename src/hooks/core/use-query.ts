import { useMemo } from 'react';
import { useQuery as useInstantQuery } from '@/api/db/client';

type AnyFn = (...args: any[]) => any;

/**
 * Options for `createQueryHook`.
 */
export interface CreateQueryHookOptions<TData> {
  /** Maps the raw InstantDB response to the desired data shape. */
  select?: (raw: any) => TData;
  /** Fallback value returned when no data is available. */
  initialData?: TData;
  /** Predicate that controls whether the query executes. */
  enabled?: (...args: any[]) => boolean;
}

/**
 * Creates a typed query hook that returns `{ data, isLoading, error }`.
 */
export function createQueryHook<TArgs extends AnyFn, TData = any>(
  buildQuery: TArgs,
  options?: CreateQueryHookOptions<TData>
) {
  return (...args: Parameters<TArgs>) => {
    const isEnabled = options?.enabled ? options.enabled(...args) : true;
    const query = useMemo(() => (isEnabled ? buildQuery(...args) : null), [isEnabled, ...args]);

    const { data: raw, isLoading, error } = useInstantQuery(query ?? {});

    const data = (options?.select ? options.select(raw) : (raw as TData)) ?? options?.initialData;

    return { data: data as TData, isLoading: !!isEnabled && isLoading, error } as const;
  };
}



