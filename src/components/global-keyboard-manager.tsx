/**
 * Global Keyboard Manager
 * Central component that manages all keyboard events and provides
 * utilities for key recording and shortcut debugging
 */

'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useUnifiedShortcuts, useModifierKeys } from '@/hooks/use-unified-shortcuts'
import { shortcutRegistry, getAllShortcuts, findShortcutConflicts } from '@/lib/shortcut-registry'
import { isTauri } from '@/utils/native-utils'

export interface KeyboardManagerProps {
  children: React.ReactNode
  enableDebugging?: boolean
  onShortcutTriggered?: (action: string, key: string) => void
}

export interface KeyRecording {
  key: string
  ctrl: boolean
  shift: boolean
  alt: boolean
  meta: boolean
  timestamp: number
}

export function GlobalKeyboardManager({
  children,
  enableDebugging = false,
  onShortcutTriggered
}: KeyboardManagerProps) {
  const [isDebugMode, setIsDebugMode] = useState(enableDebugging)
  const [currentContext, setCurrentContext] = useState<string>('global')
  const [keyRecording, setKeyRecording] = useState<KeyRecording | null>(null)
  const [conflicts, setConflicts] = useState(findShortcutConflicts())
  const [showShortcutHelp, setShowShortcutHelp] = useState(false)
  const modifiers = useModifierKeys()

  const debugLog = useCallback((message: string, data?: any) => {
    if (isDebugMode) {
      console.log(`[GlobalKeyboardManager] ${message}`, data || '')
    }
  }, [isDebugMode])

  // Handle context changes based on active element
  useEffect(() => {
    const handleFocusChange = () => {
      const activeElement = document.activeElement as HTMLElement
      let newContext = 'global'

      if (activeElement?.closest('[data-context="file-tree"]')) {
        newContext = 'file-tree'
      } else if (activeElement?.closest('[data-context="editor"]')) {
        newContext = 'editor'
      } else if (document.querySelector('[data-context-menu="true"]')) {
        newContext = 'context-menu'
      }

      if (newContext !== currentContext) {
        debugLog(`Context changed: ${currentContext} -> ${newContext}`)
        setCurrentContext(newContext)
      }
    }

    // Set up event listeners for context changes
    document.addEventListener('focusin', handleFocusChange)
    document.addEventListener('focusout', handleFocusChange)

    // Initial context detection
    handleFocusChange()

    return () => {
      document.removeEventListener('focusin', handleFocusChange)
      document.removeEventListener('focusout', handleFocusChange)
    }
  }, [currentContext, debugLog])

  // Register application-level shortcuts
  const { setEnabled, setContext } = useUnifiedShortcuts([
    {
      id: 'toggle-shortcut-help',
      handler: () => {
        setShowShortcutHelp(prev => !prev)
        debugLog('Shortcut help toggled')
      }
    },
    {
      id: 'toggle-debug-mode',
      handler: () => {
        setIsDebugMode(prev => !prev)
        debugLog('Debug mode toggled')
      }
    }
  ], {
    context: 'global',
    enabled: true
  })

  // Listen for shortcut registry updates
  useEffect(() => {
    const handleRegistryUpdate = () => {
      const newConflicts = findShortcutConflicts()
      setConflicts(newConflicts)
      debugLog('Shortcut registry updated', { conflicts: newConflicts })
    }

    shortcutRegistry.addEventListener('shortcut-updated', handleRegistryUpdate)

    return () => {
      shortcutRegistry.removeEventListener('shortcut-updated', handleRegistryUpdate)
    }
  }, [debugLog])

  // Load shortcuts from Tauri on mount
  useEffect(() => {
    if (isTauri) {
      shortcutRegistry.loadFromTauri().then(() => {
        debugLog('Shortcuts loaded from Tauri')
      })
    }
  }, [debugLog])

  // Handle global keyboard events for debugging and key recording
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Update key recording if active
      if (keyRecording) {
        const newRecording: KeyRecording = {
          key: event.key,
          ctrl: event.ctrlKey,
          shift: event.shiftKey,
          alt: event.altKey,
          meta: event.metaKey,
          timestamp: Date.now()
        }
        setKeyRecording(newRecording)
        debugLog('Key recorded', newRecording)
      }

      // Notify about shortcut triggers
      if (onShortcutTriggered) {
        const allShortcuts = getAllShortcuts()
        const matchingShortcut = allShortcuts.find(shortcut =>
          shortcut.enabled && event.ctrlKey && shortcut.key.includes('ctrl')
        )
        if (matchingShortcut) {
          onShortcutTriggered(matchingShortcut.action, matchingShortcut.key)
        }
      }
    }

    const handleKeyUp = () => {
      // Clear key recording on key up
      if (keyRecording) {
        setTimeout(() => setKeyRecording(null), 100)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('keyup', handleKeyUp)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('keyup', handleKeyUp)
    }
  }, [keyRecording, debugLog, onShortcutTriggered])

  // Update context for unified shortcuts
  useEffect(() => {
    setContext(currentContext)
  }, [currentContext, setContext])

  // Utility functions exposed to the app
  const utilities = {
    /**
     * Start recording a key combination
     */
    startKeyRecording: () => {
      setKeyRecording({ key: '', ctrl: false, shift: false, alt: false, meta: false, timestamp: Date.now() })
      debugLog('Started key recording')
    },

    /**
     * Stop recording a key combination
     */
    stopKeyRecording: () => {
      setKeyRecording(null)
      debugLog('Stopped key recording')
    },

    /**
     * Get current key recording
     */
    getKeyRecording: () => keyRecording,

    /**
     * Toggle debug mode
     */
    toggleDebugMode: () => {
      setIsDebugMode(prev => !prev)
    },

    /**
     * Toggle shortcut help overlay
     */
    toggleShortcutHelp: () => {
      setShowShortcutHelp(prev => !prev)
    },

    /**
     * Get current conflicts
     */
    getConflicts: () => conflicts,

    /**
     * Get all shortcuts for current context
     */
    getContextualShortcuts: () => {
      return getAllShortcuts().filter(shortcut =>
        shortcut.priority === 'global' ||
        shortcut.context === currentContext ||
        !shortcut.context
      )
    }
  }

  // Make utilities available globally for debugging
  if (typeof window !== 'undefined') {
    (window as any).keyboardManager = utilities
  }

  return (
    <>
      {children}

      {/* Debug Overlay */}
      {isDebugMode && (
        <div className="fixed top-4 right-4 bg-black/80 text-white p-4 rounded-lg text-xs font-mono z-50 max-w-sm">
          <h3 className="font-bold mb-2">Keyboard Debug Info</h3>
          <div>Context: {currentContext}</div>
          <div>Modifiers: {JSON.stringify(modifiers)}</div>
          <div>Conflicts: {conflicts.length}</div>
          {keyRecording && (
            <div className="mt-2 p-2 bg-green-600/20 rounded">
              <div>Recording: {keyRecording.key}</div>
              <div>Ctrl: {keyRecording.ctrl ? '✓' : '✗'}</div>
              <div>Shift: {keyRecording.shift ? '✓' : '✗'}</div>
              <div>Alt: {keyRecording.alt ? '✓' : '✗'}</div>
              <div>Meta: {keyRecording.meta ? '✓' : '✗'}</div>
            </div>
          )}
        </div>
      )}

      {/* Shortcut Help Overlay */}
      {showShortcutHelp && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold">Keyboard Shortcuts</h2>
                <button
                  onClick={() => setShowShortcutHelp(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                <div>
                  <h3 className="font-semibold mb-2">Global Shortcuts</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {getAllShortcuts()
                      .filter(s => s.priority === 'global')
                      .map(shortcut => (
                        <div key={shortcut.id} className="flex justify-between p-2 bg-gray-50 rounded">
                          <span>{shortcut.description || shortcut.id}</span>
                          <kbd className="px-2 py-1 bg-gray-200 rounded text-xs">
                            {shortcut.key}
                          </kbd>
                        </div>
                      ))}
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-2">Context: {currentContext}</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {utilities.getContextualShortcuts()
                      .filter(s => s.priority !== 'global')
                      .map(shortcut => (
                        <div key={shortcut.id} className="flex justify-between p-2 bg-gray-50 rounded">
                          <span>{shortcut.description || shortcut.id}</span>
                          <kbd className="px-2 py-1 bg-gray-200 rounded text-xs">
                            {shortcut.key}
                          </kbd>
                        </div>
                      ))}
                  </div>
                </div>

                {conflicts.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-2 text-red-600">⚠️ Conflicts</h3>
                    <div className="space-y-2 text-sm">
                      {conflicts.map((conflict, index) => (
                        <div key={index} className="p-2 bg-red-50 rounded">
                          <div className="font-medium">{conflict.key}</div>
                          <div className="text-xs text-gray-600">
                            {conflict.shortcuts.map(s => s.id).join(', ')}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/**
 * Hook to access keyboard manager utilities
 */
export function useKeyboardManager() {
  const [manager, setManager] = useState<any | null>(null)

  useEffect(() => {
    setManager((window as any).keyboardManager || null)
  }, [])

  return manager
}