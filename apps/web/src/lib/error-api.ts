'use client';

import type { ErrorHandlerOptions } from '@/hooks/use-error-handler';

// Global error handler that doesn't require React hooks
class ErrorAPI {
    private listeners: Array<(error: ErrorInfo) => void> = [];

    private formatError(error: unknown, fallbackMessage: string = 'An unexpected error occurred') {
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

        return { title: errorTitle, message: errorMessage, original: error };
    }

    // Add a listener for error notifications (could be connected to toast, console, etc.)
    addListener(listener: (error: ErrorInfo) => void) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    // Handle error without requiring hooks
    handleError(error: unknown, context?: string, options: ErrorHandlerOptions = {}) {
        const {
            fallbackMessage = 'An unexpected error occurred',
            logToConsole = true,
        } = options;

        const errorInfo = this.formatError(error, fallbackMessage);

        if (context) {
            errorInfo.title = `${errorInfo.title} in ${context}`;
        }

        if (logToConsole) {
            console.error(`Error${context ? ` in ${context}` : ''}:`, error);
        }

        // Notify all listeners
        this.listeners.forEach(listener => listener(errorInfo));

        return errorInfo;
    }

    // Handle async operations without hooks
    async handleAsyncError<T>(
        asyncFn: () => Promise<T>,
        context?: string,
        options: ErrorHandlerOptions = {}
    ): Promise<{ data?: T; error?: ErrorInfo }> {
        try {
            const data = await asyncFn();
            return { data };
        } catch (error) {
            const formattedError = this.handleError(error, context, options);
            return { error: formattedError };
        }
    }
}

export type ErrorInfo = {
    title: string;
    message: string;
    original: unknown;
};

// Singleton instance
export const errorAPI = new ErrorAPI();

// Convenience functions
export const handleError = (error: unknown, context?: string, options?: ErrorHandlerOptions) =>
    errorAPI.handleError(error, context, options);

export const handleAsyncError = <T>(
    asyncFn: () => Promise<T>,
    context?: string,
    options?: ErrorHandlerOptions
) => errorAPI.handleAsyncError(asyncFn, context, options);