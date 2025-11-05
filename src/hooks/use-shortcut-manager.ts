import { useState, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { isTauri } from '@/utils/native-utils'

export type ShortcutConfig = {
  id: string
  key: string
  action: string
  enabled: boolean
}

export const useShortcutManager = () => {
  const [shortcuts, setShortcuts] = useState<ShortcutConfig[]>([])

  async function loadShortcuts() {
    if (!isTauri) return
    const data = await invoke<ShortcutConfig[]>('get_shortcuts')
    setShortcuts(data)
  }

  async function createShortcut(config: Omit<ShortcutConfig, 'id'>) {
    if (!isTauri) return
    const id = crypto.randomUUID()
    await invoke('create_shortcut', { config: { ...config, id } })
    await loadShortcuts()
  }

  async function updateShortcut(id: string, config: ShortcutConfig) {
    if (!isTauri) return
    await invoke('update_shortcut', { id, config })
    await loadShortcuts()
  }

  async function deleteShortcut(id: string) {
    if (!isTauri) return
    await invoke('delete_shortcut', { id })
    await loadShortcuts()
  }

  useEffect(() => {
    loadShortcuts()
  }, [])

  return {
    shortcuts,
    createShortcut,
    updateShortcut,
    deleteShortcut,
    loadShortcuts
  }
}

export const useShortcutListener = (handlers: Record<string, () => void>) => {
  const handlersRef = useRef(handlers)

  // Update ref when handlers change
  useEffect(() => {
    handlersRef.current = handlers
  }, [handlers])

  useEffect(() => {
    if (!isTauri) {
      console.log('[Shortcut] Not running in Tauri, skipping event listener setup')
      return
    }

    console.log('[Shortcut] Setting up event listener, registered handlers:', Object.keys(handlersRef.current))

    let unlistenFn: (() => void) | null = null

    listen<string>('shortcut-triggered', (event) => {
      console.log('[Shortcut] Event received:', event.payload, 'Available handlers:', Object.keys(handlersRef.current))
      const handler = handlersRef.current[event.payload]
      if (handler) {
        console.log('[Shortcut] Calling handler for:', event.payload)
        try {
          handler()
          console.log('[Shortcut] Handler executed successfully for:', event.payload)
        } catch (error) {
          console.error('[Shortcut] Error executing handler for:', event.payload, error)
        }
      } else {
        console.warn('[Shortcut] No handler found for:', event.payload, 'Available handlers:', Object.keys(handlersRef.current))
      }
    })
      .then((fn) => {
        console.log('[Shortcut] Event listener registered successfully')
        unlistenFn = fn
      })
      .catch((error) => {
        console.error('[Shortcut] Failed to register event listener:', error)
      })

    return () => {
      if (unlistenFn) {
        console.log('[Shortcut] Unregistering event listener')
        unlistenFn()
      }
    }
  }, []) // Empty deps - handlers are accessed via ref
}
