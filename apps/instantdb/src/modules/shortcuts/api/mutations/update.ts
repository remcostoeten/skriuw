/**
 * @name Update Shortcut Mutation
 * @description Mutation hook for updating a shortcut
 */

import { useMutation, useUpdate } from '@/hooks/core'
import type { TShortcut } from '../../types'
import { withTimestamps } from '@/shared/utilities/timestamps'

type props = {  
    id: UUID
} & Partial<Omit<TShortcut, 'id' | 'createdAt'>>

export function useUpdateShortcut() {
    const { update } = useUpdate('shortcuts')
    const { mutate, isLoading, error } = useMutation(async ({ id, ...updates }: props) => {
        await update(id, withTimestamps(updates))
    })

    return { updateShortcut: mutate, isLoading, error }
}

