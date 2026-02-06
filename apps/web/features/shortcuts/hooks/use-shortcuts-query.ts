import type { ShortcutId, KeyCombo } from '../shortcut-definitions'
import type { CustomShortcut } from '../types'
import { useSession } from '@/lib/auth-client'
import { STORAGE_KEYS } from '@/lib/storage-keys'
import { readMany, readOne, update, create, destroy } from '@skriuw/crud'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export const shortcutsKeys = {
	all: ['shortcuts'] as const,
	user: (userId: string | undefined) => [...shortcutsKeys.all, { userId }] as const
}

const DEFAULT_SHORTCUTS: Record<ShortcutId, KeyCombo[]> = {
	'editor-focus': [],
	'toggle-shortcuts': [],
	'toggle-sidebar': [],
	'open-settings': [],
	'open-collection': [],
	'create-note': [],
	'create-folder': [],
	'rename-item': [],
	'delete-item': [],
	'pin-item': [],
	'split.toggle': [],
	'split.swap': [],
	'split.orientation.next': [],
	'split.vertical': [],
	'split.horizontal': [],
	'split.focus.left': [],
	'split.focus.right': [],
	'split.close': [],
	'split.cycle': [],
	'command-executor': [],
	'toggle-theme': []
}

export function useShortcutsQuery() {
	const { data: session } = useSession()
	const userId = session?.user?.id ?? 'guest'

	return useQuery({
		queryKey: shortcutsKeys.user(userId),
		queryFn: async () => {
			const result = await readMany<CustomShortcut>(STORAGE_KEYS.SHORTCUTS, { userId })

			const shortcuts: Record<ShortcutId, KeyCombo[]> = { ...DEFAULT_SHORTCUTS }

			if (result.success && result.data) {
				for (const shortcut of result.data) {
					shortcuts[shortcut.id as ShortcutId] = shortcut.keys
				}
			}
			return shortcuts
		},
		staleTime: 60000
	})
}

export function useSaveShortcutMutation() {
	const queryClient = useQueryClient()
	const { data: session } = useSession()
	const userId = session?.user?.id ?? 'guest'

	return useMutation({
		mutationFn: async ({ id, keys }: { id: ShortcutId; keys: KeyCombo[] }) => {
			// Check existence (upsert)
			const existing = await readOne<CustomShortcut>(STORAGE_KEYS.SHORTCUTS, id, { userId })

			if (existing.success && existing.data) {
				const result = await update<CustomShortcut>(
					STORAGE_KEYS.SHORTCUTS,
					id,
					{
						keys,
						customizedAt: new Date().toISOString()
					},
					{ userId }
				)
				if (!result.success) throw new Error('Failed to update shortcut')
				return result.data
			} else {
				const result = await create<CustomShortcut>(
					STORAGE_KEYS.SHORTCUTS,
					{
						id,
						keys,
						customizedAt: new Date().toISOString()
					},
					{ userId }
				)
				if (!result.success) throw new Error('Failed to create shortcut')
				return result.data
			}
		},
		onMutate: async ({ id, keys }) => {
			await queryClient.cancelQueries({ queryKey: shortcutsKeys.user(userId) })
			const previousShortcuts = queryClient.getQueryData<Record<ShortcutId, KeyCombo[]>>(
				shortcutsKeys.user(userId)
			)

			queryClient.setQueryData(
				shortcutsKeys.user(userId),
				(old: Record<ShortcutId, KeyCombo[]> | undefined) => {
					if (!old) return { ...DEFAULT_SHORTCUTS, [id]: keys }
					return { ...old, [id]: keys }
				}
			)
			return { previousShortcuts }
		},
		onError: (err, vars, context) => {
			if (context?.previousShortcuts) {
				queryClient.setQueryData(shortcutsKeys.user(userId), context.previousShortcuts)
			}
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: shortcutsKeys.user(userId) })
		}
	})
}

export function useResetShortcutMutation() {
	const queryClient = useQueryClient()
	const { data: session } = useSession()
	const userId = session?.user?.id ?? 'guest'

	return useMutation({
		mutationFn: async (id: ShortcutId) => {
			await destroy(STORAGE_KEYS.SHORTCUTS, id, { userId })
		},
		onMutate: async (id) => {
			await queryClient.cancelQueries({ queryKey: shortcutsKeys.user(userId) })
			const previousShortcuts = queryClient.getQueryData<Record<ShortcutId, KeyCombo[]>>(
				shortcutsKeys.user(userId)
			)

			queryClient.setQueryData(
				shortcutsKeys.user(userId),
				(old: Record<ShortcutId, KeyCombo[]> | undefined) => {
					if (!old) return DEFAULT_SHORTCUTS
					// Resetting simply removes it from our customization map, so it falls back to empty (or we should know the app default?)
					// Wait, the API returns CustomShortcuts. If deleted, it's gone from DB.
					// The queryFn fills with DEFAULT_SHORTCUTS (empty arrays).
					// Does the app imply empty array = default behavior?
					// Or is there a "default" that is not stored in DB?
					// Usually shortcuts system listens to defaults if no custom.
					// Here `getShortcuts` returns empty arrays for all IDs.
					// This implies "no overrides".
					// So resetting means setting to empty array in local cache.
					return { ...old, [id]: [] }
				}
			)
			return { previousShortcuts }
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: shortcutsKeys.user(userId) })
		}
	})
}

export function useResetAllShortcutsMutation() {
	const queryClient = useQueryClient()
	const { data: session } = useSession()
	const userId = session?.user?.id ?? 'guest'

	return useMutation({
		mutationFn: async () => {
			const result = await readMany<CustomShortcut>(STORAGE_KEYS.SHORTCUTS, { userId })
			if (result.success && result.data) {
				await Promise.all(
					result.data.map((s) => destroy(STORAGE_KEYS.SHORTCUTS, s.id, { userId }))
				)
			}
		},
		onMutate: async () => {
			await queryClient.cancelQueries({ queryKey: shortcutsKeys.user(userId) })
			const previousShortcuts = queryClient.getQueryData(shortcutsKeys.user(userId))
			queryClient.setQueryData(shortcutsKeys.user(userId), DEFAULT_SHORTCUTS)
			return { previousShortcuts }
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: shortcutsKeys.user(userId) })
		}
	})
}
