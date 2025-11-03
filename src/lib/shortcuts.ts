import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '@/utils/native-utils'

type ShortcutConfig = {
  id: string
  key: string
  action: string
  enabled: boolean
}

export async function setupDefaultShortcuts() {
  if (!isTauri) {
    console.log('[Shortcuts] Not running in Tauri, skipping shortcut setup')
    return
  }

  try {
    console.log('[Shortcuts] Fetching existing shortcuts...')
    const shortcuts = await invoke<ShortcutConfig[]>('get_shortcuts')
    console.log('[Shortcuts] Found shortcuts:', shortcuts.length, shortcuts.map(s => `${s.key} -> ${s.action}`))

    if (shortcuts.length === 0) {
      console.log('[Shortcuts] No shortcuts found, creating defaults...')

      await invoke('create_shortcut', {
        config: {
          id: crypto.randomUUID(),
          key: 'CmdOrCtrl+F',
          action: 'toggle-search',
          enabled: true
        }
      })
      console.log('[Shortcuts] Created: CmdOrCtrl+F -> toggle-search')

      await invoke('create_shortcut', {
        config: {
          id: crypto.randomUUID(),
          key: 'CmdOrCtrl+0',
          action: 'toggle-folders',
          enabled: true
        }
      })
      console.log('[Shortcuts] Created: CmdOrCtrl+0 -> toggle-folders')

      await invoke('create_shortcut', {
        config: {
          id: crypto.randomUUID(),
          key: 'CmdOrCtrl+N',
          action: 'new-note',
          enabled: true
        }
      })
      console.log('[Shortcuts] Created: CmdOrCtrl+N -> new-note')

      // Verify shortcuts were created
      const verifyShortcuts = await invoke<ShortcutConfig[]>('get_shortcuts')
      console.log('[Shortcuts] Verification - registered shortcuts:', verifyShortcuts.map(s => `${s.key} -> ${s.action} (enabled: ${s.enabled})`))
    } else {
      console.log('[Shortcuts] Using existing shortcuts:', shortcuts.map(s => `${s.key} -> ${s.action} (enabled: ${s.enabled})`))
    }
  } catch (error) {
    console.error('[Shortcuts] Error setting up shortcuts:', error)
    throw error
  }
}
