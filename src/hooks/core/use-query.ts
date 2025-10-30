import { useMemo, useEffect } from 'react';
import { useQuery as useInstantQuery } from '@/api/db/client';

type AnyFn = (...args: any[]) => any;

/**
 * Options for `createQueryHook`.
 */
export type options<TData> = {
  /** Maps the raw InstantDB response to the desired data shape. */
  select?: (raw: any) => TData;
  /** Fallback value returned when no data is available. */
  initialData?: TData;
  /** Predicate that controls whether the query executes. */
  enabled?: (...args: any[]) => boolean;
  /** Whether to show error toast notifications. */
  showErrorToast?: boolean;
  /** Context for error messages. */
  errorContext?: string;
  /** Callback for handling errors. */
  onError?: (error: Error) => void;
}

/**
 * Creates a typed query hook that returns `{ data, isLoading, error, isSuccess, isError, refetch }`.
 */
export function createQueryHook<TArgs extends AnyFn, TData = any>(
  buildQuery: TArgs,
  options?: options<TData>
) {
  return (...args: Parameters<TArgs>) => {
    const isEnabled = options?.enabled ? options.enabled(...args) : true;
    const query = useMemo(() => (isEnabled ? buildQuery(...args) : null), [isEnabled, ...args]);

    const { data: raw, isLoading, error } = useInstantQuery(query ?? {});

    const data = (options?.select ? options.select(raw) : (raw as TData)) ?? options?.initialData;
    const isSuccess = !isLoading && !error && isEnabled;
    const isError = !!error && isEnabled;

    useEffect(() => {
      if (error && isError && options?.showErrorToast !== false) {
        import('@/hooks/use-error-handler').then(({ useErrorHandler }) => {
          const { handleError } = useErrorHandler();
          handleError(error, options?.errorContext);
        });
      }

      if (error && isError && options?.onError) {
        options.onError(error as Error);
      }
    }, [error, isError]);

    return {
      data: data as TData,
      isLoading: !!isEnabled && isLoading,
      error: error as Error | null,
      isSuccess,
      isError
    } as const;
  };
}



