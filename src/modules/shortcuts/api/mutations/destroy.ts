/**
 * @name Delete Shortcut Mutation
 * @description Mutation hook for deleting a shortcut
 */

import { useDestroy, useMutation } from '@/hooks/core'

export function useDeleteShortcut() {
    const { destroy } = useDestroy('shortcuts')
    const { mutate, isLoading, error } = useMutation(async (id: string) => {
        await destroy(id)
    })

    return { deleteShortcut: mutate, isLoading, error }
}

