/**
 * Shortcuts Hooks
 * Simplified hooks for components
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useGetEnabledShortcuts } from './api/queries/get-shortcuts'
import type { ShortcutBinding, TShortcutAction } from './types'
import { matchesShortcut, shouldPreventShortcut } from './utils'

/**
 * Creates a handler function for a given shortcut action
 * Dispatches custom events that components can listen to
 */
function createShortcutHandler(action: TShortcutAction): (() => void) | null {
  switch (action) {
    case 'toggle-search':
      return () => {
        window.dispatchEvent(new CustomEvent('search:toggle'))
        window.dispatchEvent(new CustomEvent('menu:toggle-search'))
      }
    case 'toggle-folders':
      return () => {
        window.dispatchEvent(new CustomEvent('folders:toggle'))
        window.dispatchEvent(new CustomEvent('folders:expand-toggle'))
      }
    case 'new-note':
    case 'create-note':
      return () => {
        window.dispatchEvent(new CustomEvent('note:create'))
      }
    case 'new-folder':
    case 'create-folder':
      return () => {
        window.dispatchEvent(new CustomEvent('folder:create'))
      }
    case 'settings':
    case 'open-preferences':
      return () => {
        window.dispatchEvent(new CustomEvent('preferences:open'))
      }
    default:
      return null
  }
}

/**
 * Global shortcut handler
 * Registers all enabled shortcuts from database and dispatches events
 */
export function useGlobalShortcuts() {
  const { shortcuts, loading } = useGetEnabledShortcuts()

  useEffect(() => {
    if (loading) return

    const handlers = new Map<string, () => void>()
    shortcuts.forEach(shortcut => {
      const handler = createShortcutHandler(shortcut.action)
      if (handler) {
        handlers.set(shortcut.combo, handler)
      }
    })

    const handleKeyDown = (event: KeyboardEvent) => {
      if (shouldPreventShortcut(event)) return

      for (const [combo, handler] of handlers.entries()) {
        if (matchesShortcut(event, combo)) {
          event.preventDefault()
          event.stopPropagation()
          handler()
          return
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [shortcuts, loading])
}

/**
 * Component shortcut handler
 * Allows components to register custom handlers for specific shortcuts
 */
export function useComponentShortcuts(bindings: ShortcutBinding[], options?: { enabled?: boolean }) {
  const { shortcuts: dbShortcuts, loading } = useGetEnabledShortcuts()
  const bindingsRef = useRef(bindings)
  const enabledRef = useRef(options?.enabled !== false)

  useEffect(() => {
    bindingsRef.current = bindings
    enabledRef.current = options?.enabled !== false
  }, [bindings, options])

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabledRef.current || loading) return
    if (shouldPreventShortcut(event)) return

    const matchingShortcut = dbShortcuts.find(shortcut => {
      if (!shortcut.enabled) return false
      if (!matchesShortcut(event, shortcut.combo)) return false
      return bindingsRef.current.some(b => b.id === shortcut.action)
    })

    if (!matchingShortcut) return

    const binding = bindingsRef.current.find(b => b.id === matchingShortcut.action)
    if (binding) {
      event.preventDefault()
      event.stopPropagation()
      binding.handler()
    }
  }, [dbShortcuts, loading])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [handleKeyDown])
}

/**
 * Hook to track modifier key states
 */
export function useModifierKeys() {
  const [modifiers, setModifiers] = useState({
    ctrl: false,
    shift: false,
    alt: false,
    meta: false,
  })

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      setModifiers({
        ctrl: e.ctrlKey,
        shift: e.shiftKey,
        alt: e.altKey,
        meta: e.metaKey,
      })
    }

    const handleKeyUp = () => {
      setModifiers({
        ctrl: false,
        shift: false,
        alt: false,
        meta: false,
      })
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  return modifiers
}

