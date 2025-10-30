import { useQuery } from '@/api/db/client';

export function useRead<T>(query: any) {
    const { data, isLoading, error } = useQuery(query);

    return {
        data: data as T,
        isLoading,
        error,
    };
}


