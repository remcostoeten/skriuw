/**
 * Create Shortcut Mutation
 */

import { useCreate, useMutation } from '@/hooks/core'
import { generateId } from 'utils'
import type { TShortcut } from '../../types'
import { withTimestamps } from '@/shared/utilities/timestamps'

type props = Omit<TShortcut, 'id' | 'createdAt' | 'updatedAt'>      

export function useCreateShortcut() {
    const { create } = useCreate('shortcuts')
    const { mutate, isLoading, error } = useMutation(async (input: props) => {
        const id = generateId()
        const data = withTimestamps(input, true)
        await create(id, data)
        return { id, ...data }
    })

    return { createShortcut: mutate, isLoading, error }
}

