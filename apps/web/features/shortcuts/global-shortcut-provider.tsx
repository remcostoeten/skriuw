import { createContext, useEffect, useRef, useState } from 'react'

import { getShortcuts } from './api/queries/get-shortcuts'
import { KeyCombo, ShortcutId, shortcutDefinitions } from './shortcut-definitions'

type ShortcutHandler = (event: KeyboardEvent) => void
type ShortcutRegistry = Map<ShortcutId, ShortcutHandler>

export type ShortcutContextValue = {
	register: (id: ShortcutId, handler: ShortcutHandler) => void
	unregister: (id: ShortcutId) => void
}
/**
 * Checks if a keyboard event matches the given key combination.
 * Separated concern: key matching algorithm.
 */
function matchesKeyCombination(event: KeyboardEvent, keys: KeyCombo): boolean {
	const result = keys.every((k) => {
		if (k === 'Ctrl') return event.ctrlKey
		if (k === 'Meta') return event.metaKey
		if (k === 'Shift') return event.shiftKey
		if (k === 'Alt') return event.altKey
		// Handle comma key specially - check both event.key and event.code
		// k is "," (string) from definition, event.key is "," when comma is pressed
		if (k === ',') {
			const matches = event.key === ',' || event.code === 'Comma'
			console.log(`🔍 Comma check: key="${event.key}" code="${event.code}" matches=${matches}`)
			return matches
		}
		// Handle backtick key - event.code is "Backquote", event.key is "`"
		if (k === '`') {
			return event.key === '`' || event.code === 'Backquote'
		}
		const matches = event.key.toLowerCase() === k.toLowerCase()
		console.log(`🔍 Key check: "${k}" vs "${event.key}" matches=${matches}`)
		return matches
	})
	console.log(`🎯 Key combo match: [${keys.join('+')}] -> ${result}`, {
		key: event.key,
		code: event.code,
		ctrlKey: event.ctrlKey,
		altKey: event.altKey,
		metaKey: event.metaKey,
		shiftKey: event.shiftKey,
	})
	return result
}

function matchesAnyCombination(event: KeyboardEvent, combos: KeyCombo[]): boolean {
	return combos.some((combo) => matchesKeyCombination(event, combo))
}

/**
 * Check if we're in an input/editor context
 */
function isInInputContext(target: EventTarget | null): boolean {
	if (!target) return false
	const el = target as HTMLElement

	return (
		el.tagName === 'INPUT' ||
		el.tagName === 'TEXTAREA' ||
		el.isContentEditable ||
		!!el.closest('[contenteditable="true"]')
	)
}

/**
 * Creates a keydown event handler for the given shortcut registry.
 */
function createKeyDownHandler(
	registryRef: React.MutableRefObject<ShortcutRegistry>,
	customShortcuts: Partial<Record<ShortcutId, KeyCombo[]>>
) {
	return (event: KeyboardEvent) => {
		const inInput = isInInputContext(event.target)
		const registry = registryRef.current

		for (const [id, handler] of registry.entries()) {
			const definition = shortcutDefinitions[id]
			if (!definition) continue

			// Skip disabled shortcuts
			if (definition.enabled === false) continue

			const keyCombos = customShortcuts[id] || definition.keys

			if (matchesAnyCombination(event, keyCombos)) {
				console.log(`🎯 Shortcut matched: ${id}`, {
					key: event.key,
					code: event.code,
					ctrlKey: event.ctrlKey,
					altKey: event.altKey,
					metaKey: event.metaKey,
					inInput,
				})

				// If in input/editor, only trigger shortcuts with modifiers
				if (inInput) {
					const hasModifier = event.ctrlKey || event.metaKey || event.altKey
					if (!hasModifier) {
						console.log(`❌ Shortcut blocked: in input context without modifier`)
						continue
					}
				}

				console.log(`✅ Executing shortcut: ${id}`)
				handler(event)
				return // Only trigger the first matching shortcut
			}
		}
	}
}

export const ShortcutContext = createContext<ShortcutContextValue | null>(null)

export const ShortcutProvider = ({ children }: { children: React.ReactNode }) => {
	const shortcuts = useRef<ShortcutRegistry>(new Map())
	const [customShortcuts, setCustomShortcuts] = useState<Partial<Record<ShortcutId, KeyCombo[]>>>(
		{}
	)

	const registryManager = useRef<ShortcutContextValue>({
		register: (id: ShortcutId, handler: ShortcutHandler) => {
			const definition = shortcutDefinitions[id]
			if (!definition) {
				console.warn(`Shortcut "${id}" is not declared in shortcut-definitions.ts`)
				return
			}
			// Don't register disabled shortcuts
			if (definition.enabled === false) {
				console.warn(`Shortcut "${id}" is disabled and cannot be registered`)
				return
			}
			console.log(`📝 Registering shortcut: ${id}`, definition.keys)
			shortcuts.current.set(id, handler)
		},
		unregister: (id: ShortcutId) => {
			shortcuts.current.delete(id)
		},
	})

	// Load custom shortcuts on mount (non-blocking)
	useEffect(() => {
		const loadCustomShortcuts = async () => {
			try {
				const custom = await getShortcuts()
				setCustomShortcuts(custom)
			} catch (error) {
				console.error('Failed to load shortcuts:', error)
			}
		}
		// Don't block - load in background
		loadCustomShortcuts()
	}, [])

	// Listen for shortcut updates
	useEffect(() => {
		const handleShortcutsUpdated = async () => {
			const custom = await getShortcuts()
			setCustomShortcuts(custom)
		}

		window.addEventListener('shortcuts-updated', handleShortcutsUpdated)
		return () => window.removeEventListener('shortcuts-updated', handleShortcutsUpdated)
	}, [])

	useEffect(() => {
		const handleKeyDown = createKeyDownHandler(shortcuts, customShortcuts)
		window.addEventListener('keydown', handleKeyDown, true) // Use capture phase
		return () => window.removeEventListener('keydown', handleKeyDown, true)
	}, [customShortcuts])

	return (
		<ShortcutContext.Provider value={registryManager.current}>{children}</ShortcutContext.Provider>
	)
}
