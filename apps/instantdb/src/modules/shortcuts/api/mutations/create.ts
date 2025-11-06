/**
 * Create Shortcut Mutation
 */

import { useCreate, useMutation } from '@/hooks/core'
import { generateId } from 'utils'
import type { TShortcut } from '../../types'

type CreateShortcutInput = Omit<TShortcut, 'id' | 'createdAt' | 'updatedAt'>

export function useCreateShortcut() {
    const { create } = useCreate('shortcuts')
    const { mutate, isLoading, error } = useMutation(async (input: CreateShortcutInput) => {
        const id = generateId()
        const now = Date.now()
        await create(id, {
            ...input,
            createdAt: now,
            updatedAt: now,
        })
        return { id, ...input, createdAt: now, updatedAt: now }
    })

    return { createShortcut: mutate, isLoading, error }
}

