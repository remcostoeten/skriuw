/**
 * Unified Keyboard Shortcuts Hook
 * Replaces multiple shortcut systems with a single, unified approach
 */

import { useEffect, useRef, useCallback, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { isTauri } from '@/utils/native-utils'
import { shortcutRegistry, type ShortcutDefinition, type ShortcutPriority } from '@/lib/shortcut-registry'

export type ShortcutHandler = () => void

export interface ShortcutBinding {
  id: string
  handler: ShortcutHandler
  priority?: ShortcutPriority
  context?: string
}

export interface UnifiedShortcutConfig {
  [key: string]: ShortcutHandler
}

/**
 * Check if the current platform is Mac
 */
function isMac(): boolean {
  if (typeof window === 'undefined') return false
  return /Mac|iPhone|iPod|iPad/i.test(navigator.platform) ||
         /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent)
}

/**
 * Parse a shortcut string like "CmdOrCtrl+F" into components
 */
function parseShortcutString(shortcut: string): {
  key: string
  ctrl: boolean
  shift: boolean
  alt: boolean
  meta: boolean
} {
  const parts = shortcut.toLowerCase().split('+').map(p => p.trim())
  const key = parts[parts.length - 1]

  return {
    key,
    ctrl: parts.some(p => p === 'ctrl' || p === 'cmdorctrl'),
    shift: parts.some(p => p === 'shift'),
    alt: parts.some(p => p === 'alt'),
    meta: parts.some(p => p === 'cmd' || p === 'cmdorctrl')
  }
}

/**
 * Check if a keyboard event matches a shortcut definition
 */
function matchesKeyboardEvent(
  event: KeyboardEvent,
  shortcut: ShortcutDefinition
): boolean {
  const parsed = parseShortcutString(shortcut.key)
  const isMacPlatform = isMac()

  // Check key match (normalize for special keys)
  let eventKey = event.key.toLowerCase()
  let shortcutKey = parsed.key.toLowerCase()

  // Handle number keys and special cases
  if (/^\d$/.test(shortcutKey)) {
    if (eventKey !== shortcutKey && eventKey !== `digit${shortcutKey}`) {
      return false
    }
  } else {
    if (eventKey !== shortcutKey) {
      return false
    }
  }

  // Check modifiers based on platform
  const ctrlRequired = parsed.ctrl
  const shiftRequired = parsed.shift
  const altRequired = parsed.alt
  const metaRequired = parsed.meta

  // On Mac, CmdOrCtrl maps to Meta, on others it maps to Ctrl
  const ctrlPressed = event.ctrlKey
  const metaPressed = event.metaKey

  if (ctrlRequired) {
    if (isMacPlatform) {
      if (!metaPressed) return false
    } else {
      if (!ctrlPressed) return false
    }
  } else {
    // If Ctrl not required, ensure it's not pressed (unless other modifiers are)
    if (ctrlPressed && !shiftRequired && !altRequired && !metaRequired) return false
  }

  if (shiftRequired && !event.shiftKey) return false
  if (!shiftRequired && event.shiftKey && !ctrlRequired && !altRequired && !metaRequired) return false

  if (altRequired && !event.altKey) return false
  if (!altRequired && event.altKey) return false

  if (metaRequired && !metaPressed) return false
  if (!metaRequired && metaPressed && !ctrlRequired && !shiftRequired && !altRequired) return false

  return true
}

/**
 * Check if we should prevent the shortcut from firing based on the current focus
 */
function shouldPreventShortcut(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement

  // Don't fire shortcuts when typing in inputs, textareas, or contenteditable elements
  // unless they include modifier keys (to avoid interfering with typing)
  if (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable ||
    (target as any).role === 'textbox'
  ) {
    const hasModifier = event.ctrlKey || event.metaKey || event.altKey
    return !hasModifier
  }

  return false
}

/**
 * Get current context based on active element and application state
 */
function getCurrentContext(): string {
  const activeElement = document.activeElement as HTMLElement

  // Check if we're in a file tree context
  if (activeElement?.closest('[data-context="file-tree"]')) {
    return 'file-tree'
  }

  // Check if we're in an editor context
  if (activeElement?.closest('[data-context="editor"]')) {
    return 'editor'
  }

  // Check if a context menu is open
  if (document.querySelector('[data-context-menu="true"]')) {
    return 'context-menu'
  }

  return 'global'
}

/**
 * Unified keyboard shortcuts hook
 *
 * @param config - Object mapping shortcut IDs to handlers
 * @param options - Configuration options
 *
 * @example
 * useUnifiedShortcuts({
 *   'toggle-search': () => searchState.toggle(),
 *   'new-note': () => createNote(),
 *   'context-rename': () => renameItem()
 * }, { context: 'file-tree' })
 */
export function useUnifiedShortcuts(
  bindings: ShortcutBinding[],
  options?: {
    context?: string
    enabled?: boolean
  }
) {
  const bindingsRef = useRef(bindings)
  const optionsRef = useRef(options || {})
  const enabledRef = useRef(options?.enabled !== false)

  // Update refs when props change
  useEffect(() => {
    bindingsRef.current = bindings
    optionsRef.current = options || {}
    enabledRef.current = options?.enabled !== false
  }, [bindings, options])

  // Handle keyboard events
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabledRef.current) return

    // Check if we should prevent the shortcut
    if (shouldPreventShortcut(event)) return

    const currentContext = optionsRef.current.context || getCurrentContext()
    const allShortcuts = shortcutRegistry.getAllShortcuts()

    // Find matching shortcuts
    const matchingShortcuts = allShortcuts.filter(shortcut => {
      if (!shortcut.enabled) return false
      if (!matchesKeyboardEvent(event, shortcut)) return false

      // Check context matching
      if (shortcut.priority === 'global') return true
      if (shortcut.context === currentContext) return true
      if (optionsRef.current.context && shortcut.context === optionsRef.current.context) return true

      return false
    })

    if (matchingShortcuts.length === 0) return

    // Sort by priority (global > context > local)
    matchingShortcuts.sort((a, b) => {
      const priorityOrder = { global: 3, context: 2, local: 1 }
      return priorityOrder[b.priority] - priorityOrder[a.priority]
    })

    // Execute the highest priority matching shortcut
    const shortcutToExecute = matchingShortcuts[0]

    // Find the corresponding handler
    const binding = bindingsRef.current.find(b => b.id === shortcutToExecute.action)
    if (binding) {
      console.log(`[UnifiedShortcuts] Executing shortcut: ${shortcutToExecute.key} -> ${shortcutToExecute.action}`)
      event.preventDefault()
      event.stopPropagation()

      try {
        binding.handler()
        console.log(`[UnifiedShortcuts] Handler executed successfully for: ${shortcutToExecute.action}`)
      } catch (error) {
        console.error(`[UnifiedShortcuts] Error executing handler for ${shortcutToExecute.action}:`, error)
      }
    } else {
      console.warn(`[UnifiedShortcuts] No handler found for shortcut: ${shortcutToExecute.action}`)
    }
  }, [])

  // Set up event listeners
  useEffect(() => {
    // Add global keyboard listener
    document.addEventListener('keydown', handleKeyDown, true)
    console.log('[UnifiedShortcuts] Global keyboard listener attached')

    // Set up Tauri event listener for global shortcuts
    let unlistenTauri: (() => void) | null = null

    if (isTauri) {
      listen<string>('shortcut-triggered', (event) => {
        if (!enabledRef.current) return

        console.log(`[UnifiedShortcuts] Tauri shortcut triggered: ${event.payload}`)

        // Find the corresponding handler
        const binding = bindingsRef.current.find(b => b.id === event.payload)
        if (binding) {
          try {
            binding.handler()
            console.log(`[UnifiedShortcuts] Tauri handler executed successfully for: ${event.payload}`)
          } catch (error) {
            console.error(`[UnifiedShortcuts] Error executing Tauri handler for ${event.payload}:`, error)
          }
        } else {
          console.warn(`[UnifiedShortcuts] No handler found for Tauri shortcut: ${event.payload}`)
        }
      })
        .then((fn) => {
          unlistenTauri = fn
          console.log('[UnifiedShortcuts] Tauri event listener registered')
        })
        .catch((error) => {
          console.error('[UnifiedShortcuts] Failed to register Tauri event listener:', error)
        })
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      if (unlistenTauri) {
        unlistenTauri()
        console.log('[UnifiedShortcuts] Event listeners removed')
      }
    }
  }, [handleKeyDown])

  // Listen for shortcut registry updates
  useEffect(() => {
    const handleRegistryUpdate = () => {
      console.log('[UnifiedShortcuts] Shortcut registry updated, re-evaluating bindings')
    }

    shortcutRegistry.addEventListener('shortcut-updated', handleRegistryUpdate)

    return () => {
      shortcutRegistry.removeEventListener('shortcut-updated', handleRegistryUpdate)
    }
  }, [])

  // Return utility functions
  return {
    /**
     * Update the enabled state of the shortcuts
     */
    setEnabled: (enabled: boolean) => {
      enabledRef.current = enabled
      console.log(`[UnifiedShortcuts] ${enabled ? 'Enabled' : 'Disabled'} shortcuts`)
    },

    /**
     * Update the context
     */
    setContext: (context: string) => {
      optionsRef.current.context = context
      console.log(`[UnifiedShortcuts] Context updated to: ${context}`)
    },

    /**
     * Get current enabled state
     */
    isEnabled: () => enabledRef.current,

    /**
     * Get current context
     */
    getContext: () => optionsRef.current.context
  }
}

/**
 * Convenience hook for simple shortcut definitions
 *
 * @param shortcuts - Object mapping action names to handlers
 * @param options - Configuration options
 *
 * @example
 * const shortcuts = useSimpleShortcuts({
 *   'toggle-search': () => searchState.toggle(),
 *   'new-note': () => createNote()
 * }, { context: 'sidebar' })
 */
export function useSimpleShortcuts(
  shortcuts: UnifiedShortcutConfig,
  options?: {
    context?: string
    enabled?: boolean
  }
) {
  const bindings = Object.entries(shortcuts).map(([id, handler]) => ({
    id,
    handler
  }))

  return useUnifiedShortcuts(bindings, options)
}

/**
 * Hook for tracking modifier key state (useful for multi-select)
 */
export function useModifierKeys() {
  const [modifiers, setModifiers] = useState({
    ctrl: false,
    shift: false,
    alt: false,
    meta: false
  })

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      setModifiers(prev => ({
        ctrl: e.ctrlKey || prev.ctrl,
        shift: e.shiftKey || prev.shift,
        alt: e.altKey || prev.alt,
        meta: e.metaKey || prev.meta
      }))
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      setModifiers(prev => ({
        ctrl: e.ctrlKey ? prev.ctrl : false,
        shift: e.shiftKey ? prev.shift : false,
        alt: e.altKey ? prev.alt : false,
        meta: e.metaKey ? prev.meta : false
      }))
    }

    const handleBlur = () => {
      setModifiers({ ctrl: false, shift: false, alt: false, meta: false })
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleBlur)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleBlur)
    }
  }, [])

  return modifiers
}