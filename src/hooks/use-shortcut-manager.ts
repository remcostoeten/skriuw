import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

export type ShortcutConfig = {
  id: string
  key: string
  action: string
  enabled: boolean
}

export const useShortcutManager = () => {
  const [shortcuts, setShortcuts] = useState<ShortcutConfig[]>([])

  async function loadShortcuts() {
    const data = await invoke<ShortcutConfig[]>('get_shortcuts')
    setShortcuts(data)
  }

  async function createShortcut(config: Omit<ShortcutConfig, 'id'>) {
    const id = crypto.randomUUID()
    await invoke('create_shortcut', { config: { ...config, id } })
    await loadShortcuts()
  }

  async function updateShortcut(id: string, config: ShortcutConfig) {
    await invoke('update_shortcut', { id, config })
    await loadShortcuts()
  }

  async function deleteShortcut(id: string) {
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
  useEffect(() => {
    const unlisten = listen<string>('shortcut-triggered', (event) => {
      const handler = handlers[event.payload]
      if (handler) handler()
    })

    return () => {
      unlisten.then(fn => fn())
    }
  }, [handlers])
}
