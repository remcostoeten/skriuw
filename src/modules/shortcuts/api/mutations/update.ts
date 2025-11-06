/**
 * @name Update Shortcut Mutation
 * @description Mutation hook for updating a shortcut
 */

import { useMutation, useUpdate } from '@/hooks/core'
import type { TShortcut } from '../../types'

type UpdateShortcutInput = {
    id: string
} & Partial<Omit<TShortcut, 'id' | 'createdAt'>>

export function useUpdateShortcut() {
    const { update } = useUpdate('shortcuts')
    const { mutate, isLoading, error } = useMutation(async ({ id, ...updates }: UpdateShortcutInput) => {
        await update(id, {
            ...updates,
            updatedAt: Date.now(),
        })
    })

    return { updateShortcut: mutate, isLoading, error }
}

