'use client';

import { useCallback } from 'react';
import { useToast } from '@/components/error-toast';

export type ErrorHandlerOptions = {
    showToast?: boolean;
    fallbackMessage?: string;
    logToConsole?: boolean;
};

export function useErrorHandler(options: ErrorHandlerOptions = {}) {
    const {
        showToast = true,
        fallbackMessage = 'An unexpected error occurred',
        logToConsole = true,
    } = options;

    const { showError } = useToast();

    const handleError = useCallback((error: unknown, context?: string) => {
        if (logToConsole) {
            console.error(`Error${context ? ` in ${context}` : ''}:`, error);
        }

        let errorMessage = fallbackMessage;
        let errorTitle = 'Error';

        if (error instanceof Error) {
            errorTitle = error.name || 'Error';
            errorMessage = error.message || fallbackMessage;
        } else if (typeof error === 'string') {
            errorMessage = error;
        } else if (error && typeof error === 'object' && 'message' in error) {
            errorMessage = String((error as any).message) || fallbackMessage;
        }

        // Don't show toasts for network/connection errors during initial load
        const shouldSkipToast =
            errorMessage.includes('Failed to fetch') ||
            errorMessage.includes('NetworkError') ||
            errorMessage.includes('connection') ||
            errorTitle === 'NetworkError' ||
            context?.includes('initial');

        if (showToast && !shouldSkipToast) {
            showError(
                context ? `${errorTitle} in ${context}` : errorTitle,
                errorMessage
            );
        }

        return {
            title: errorTitle,
            message: errorMessage,
            original: error,
        };
    }, [showToast, fallbackMessage, logToConsole, showError]);

    const handleAsyncError = useCallback(async (
        asyncFn: () => Promise<any>,
        context?: string
    ): Promise<{ data?: any; error?: ReturnType<typeof handleError> }> => {
        try {
            const data = await asyncFn();
            return { data };
        } catch (error) {
            const formattedError = handleError(error, context);
            return { error: formattedError };
        }
    }, [handleError]);

    return {
        handleError,
        handleAsyncError,
    };
}


