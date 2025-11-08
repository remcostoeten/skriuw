import { handleError, handleAsyncError } from './error-api';

export interface MutationOptions<TData, TVariables> {
    onSuccess?: (data: TData, variables: TVariables) => void | Promise<void>;
    onError?: (error: Error, variables: TVariables) => void | Promise<void>;
    showErrorToast?: boolean;
    errorContext?: string;
    fallbackMessage?: string;
}

/**
 * Hook-free mutation function that can be used outside React components
 */
export async function executeMutation<TData, TVariables = void>(
    mutationFn: (variables: TVariables) => Promise<TData>,
    variables: TVariables,
    options?: MutationOptions<TData, TVariables>
): Promise<{ data?: TData; error?: any }> {
    try {
        const result = await mutationFn(variables);
        await options?.onSuccess?.(result, variables);
        return { data: result };
    } catch (error) {
        const e = error as Error;

        // Handle error if toast notifications are enabled
        if (options?.showErrorToast !== false) {
            handleError(e, options?.errorContext, {
                fallbackMessage: options?.fallbackMessage,
                logToConsole: true
            });
        }

        await options?.onError?.(e, variables);
        return { error: e };
    }
}

/**
 * Creates a reusable mutation function
 */
export function createMutation<TData, TVariables = void>(
    mutationFn: (variables: TVariables) => Promise<TData>,
    defaultOptions?: MutationOptions<TData, TVariables>
) {
    return (variables: TVariables, options?: MutationOptions<TData, TVariables>) =>
        executeMutation(mutationFn, variables, { ...defaultOptions, ...options });
}