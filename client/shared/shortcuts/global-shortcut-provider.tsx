import { createContext, useEffect, useRef, useState } from 'react'
import { KeyCombo, ShortcutId, shortcutDefinitions } from './shortcut-definitions'
import { getShortcutStorage } from './api'

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
    return keys.every((k) => {
        if (k === 'Ctrl') return event.ctrlKey
        if (k === 'Meta') return event.metaKey
        if (k === 'Shift') return event.shiftKey
        return event.key.toLowerCase() === k.toLowerCase()
    })
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
    registry: ShortcutRegistry,
    customShortcuts: Partial<Record<ShortcutId, KeyCombo[]>>
) {
    return (event: KeyboardEvent) => {
        const inInput = isInInputContext(event.target)

        for (const [id, handler] of registry.entries()) {
            const definition = shortcutDefinitions[id]
            if (!definition) continue

            const keyCombos = customShortcuts[id] || definition.keys

            if (matchesAnyCombination(event, keyCombos)) {
                // If in input/editor, only trigger shortcuts with modifiers
                if (inInput) {
                    const hasModifier = event.ctrlKey || event.metaKey || event.altKey
                    if (!hasModifier) continue
                }

                handler(event)
            }
        }
    }
}

export const ShortcutContext = createContext<ShortcutContextValue | null>(null)

export const ShortcutProvider = ({ children }: { children: React.ReactNode }) => {
    const shortcuts = useRef<ShortcutRegistry>(new Map())
    const [customShortcuts, setCustomShortcuts] = useState<Partial<Record<ShortcutId, KeyCombo[]>>>({})
    const storage = getShortcutStorage()

    const registryManager = useRef<ShortcutContextValue>({
        register: (id: ShortcutId, handler: ShortcutHandler) => {
            if (!shortcutDefinitions[id]) {
                console.warn(`Shortcut "${id}" is not declared in shortcut-definitions.ts`)
                return
            }
            shortcuts.current.set(id, handler)
        },
        unregister: (id: ShortcutId) => {
            shortcuts.current.delete(id)
        },
    })

    // Load custom shortcuts on mount
    useEffect(() => {
        const loadCustomShortcuts = async () => {
            const custom = await storage.getCustomShortcuts()
            setCustomShortcuts(custom)
        }
        loadCustomShortcuts()
    }, [storage])

    // Listen for shortcut updates
    useEffect(() => {
        const handleShortcutsUpdated = async () => {
            const custom = await storage.getCustomShortcuts()
            setCustomShortcuts(custom)
        }

        window.addEventListener('shortcuts-updated', handleShortcutsUpdated)
        return () => window.removeEventListener('shortcuts-updated', handleShortcutsUpdated)
    }, [storage])

    useEffect(() => {
        const handleKeyDown = createKeyDownHandler(shortcuts.current, customShortcuts)
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [customShortcuts])

    return (
        <ShortcutContext.Provider value={registryManager.current}>
            {children}
        </ShortcutContext.Provider>
    )
}
