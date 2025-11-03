import { invoke } from '@tauri-apps/api/core'

type ShortcutConfig = {
  id: string
  key: string
  action: string
  enabled: boolean
}

export async function setupDefaultShortcuts() {
  const shortcuts = await invoke<ShortcutConfig[]>('get_shortcuts')

  if (shortcuts.length === 0) {
    await invoke('create_shortcut', {
      config: {
        id: crypto.randomUUID(),
        key: 'CmdOrCtrl+F',
        action: 'toggle-search',
        enabled: true
      }
    })

    await invoke('create_shortcut', {
      config: {
        id: crypto.randomUUID(),
        key: 'CmdOrCtrl+0',
        action: 'toggle-folders',
        enabled: true
      }
    })
  }
}
