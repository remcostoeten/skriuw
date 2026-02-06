import type { ShortcutId, KeyCombo } from '../shortcut-definitions'
import {
	useShortcutsQuery,
	useSaveShortcutMutation,
	useResetShortcutMutation,
	useResetAllShortcutsMutation
} from './use-shortcuts-query'
import { useCallback } from 'react'

/**
 * Hook to manage shortcuts programmatically
 * Useful for settings pages or advanced shortcut management
 */
export function useShortcutsManager() {
	const { data: customShortcuts, isLoading, refetch } = useShortcutsQuery()

	const saveMutation = useSaveShortcutMutation()
	const resetMutation = useResetShortcutMutation()
	const resetAllMutation = useResetAllShortcutsMutation()

	const dispatchUpdate = () => {
		window.dispatchEvent(new CustomEvent('shortcuts-updated'))
	}

	const saveShortcutHandler = useCallback(
		async (id: ShortcutId, keys: KeyCombo[]) => {
			await saveMutation.mutateAsync({ id, keys })
			dispatchUpdate()
		},
		[saveMutation]
	)

	const resetShortcutHandler = useCallback(
		async (id: ShortcutId) => {
			await resetMutation.mutateAsync(id)
			dispatchUpdate()
		},
		[resetMutation]
	)

	const resetAllShortcutsHandler = useCallback(async () => {
		await resetAllMutation.mutateAsync()
		dispatchUpdate()
	}, [resetAllMutation])

	return {
		customShortcuts: customShortcuts ?? {},
		isLoading,
		saveShortcut: saveShortcutHandler,
		resetShortcut: resetShortcutHandler,
		resetAllShortcuts: resetAllShortcutsHandler,
		reload: refetch
	}
}
