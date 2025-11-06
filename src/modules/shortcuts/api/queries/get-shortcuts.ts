/**
 * @name Get Shortcuts Query
 * @description Query hook for shortcuts
 */

import type { Shortcut as ShortcutEntity } from '@/api/db/schema'
import { createQueryHook } from '@/hooks/core'
import type { TShortcut, TShortcutAction } from '../../types'

const useShortcutsQuery = createQueryHook(
    () => ({
        shortcuts: {
            $: {
                order: { createdAt: 'asc' },
            },
        },
    }),
    {
        select: (raw) => {
            const shortcuts = (raw?.shortcuts as ShortcutEntity[]) ?? []
            return shortcuts.map(s => ({
                id: s.id,
                action: s.action as TShortcutAction,
                combo: s.combo,
                description: s.description,
                enabled: s.enabled,
                global: s.global,
                createdAt: s.createdAt,
                updatedAt: s.updatedAt,
            })) as TShortcut[]
        },
        initialData: [] as TShortcut[],
        showErrorToast: false,
    }
)

export function useGetShortcuts() {
    const { data, isLoading, error } = useShortcutsQuery()
    return { shortcuts: data, loading: isLoading, error }
}

export function useGetShortcutByAction(action: TShortcutAction) {
    const { shortcuts, loading, error } = useGetShortcuts()
    const shortcut = shortcuts.find(s => s.action === action) || null
    return { shortcut, loading, error }
}

export function useGetEnabledShortcuts() {
    const { shortcuts, loading, error } = useGetShortcuts()
    const enabledShortcuts = shortcuts.filter(s => s.enabled)
    return { shortcuts: enabledShortcuts, loading, error }
}

