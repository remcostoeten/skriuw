import { useState } from 'react';
import { transact, tx } from '@/api/db/client';

export function useCreate<T extends Record<string, any>>(entityName: string) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const create = async (id: string, data: T) => {
        try {
            setIsLoading(true);
            setError(null);

            // Skriuw transact with optimistic updates
            await transact([
                tx[entityName as keyof typeof tx][id].update(data),
            ]);

            return { id, ...data };
        } catch (err) {
            const error = err as Error;
            setError(error);
            throw error;
        } finally {
            setIsLoading(false);
        }
    };

    return { create, isLoading, error };
}


