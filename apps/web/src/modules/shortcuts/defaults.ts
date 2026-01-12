/**
 * Default Shortcuts
 */

import { transact, tx } from '@/api/db/client'
import { generateId } from 'utils'
import type { TShortcut } from './types'

const DEFAULT_SHORTCUTS: Array<Omit<TShortcut, 'id' | 'createdAt' | 'updatedAt'>> = [
  {
    action: 'toggle-search',
    combo: 'CmdOrCtrl+F',
    description: 'Toggle search panel',
    enabled: true,
    global: true,
  },
  {
    action: 'toggle-folders',
    combo: 'CmdOrCtrl+0',
    description: 'Toggle folders panel',
    enabled: true,
    global: true,
  },
  {
    action: 'new-note',
    combo: 'CmdOrCtrl+N',
    description: 'Create new note',
    enabled: true,
    global: true,
  },
  {
    action: 'new-folder',
    combo: 'CmdOrCtrl+Shift+N',
    description: 'Create new folder',
    enabled: true,
    global: true,
  },
  {
    action: 'open-preferences',
    combo: 'CmdOrCtrl+,',
    description: 'Open preferences',
    enabled: true,
    global: true,
  },
  {
    action: 'context-rename',
    combo: 'Shift+R',
    description: 'Rename selected item',
    enabled: true,
    global: false,
  },
  {
    action: 'context-duplicate',
    combo: 'Shift+D',
    description: 'Duplicate selected item',
    enabled: true,
    global: false,
  },
  {
    action: 'context-pin',
    combo: 'Shift+P',
    description: 'Pin/unpin selected item',
    enabled: true,
    global: false,
  },
  {
    action: 'context-delete',
    combo: 'Shift+Backspace',
    description: 'Delete selected item',
    enabled: true,
    global: false,
  },
  {
    action: 'clear-selection',
    combo: 'Escape',
    description: 'Clear selection',
    enabled: true,
    global: false,
  },
  {
    action: 'toggle-bold',
    combo: 'CmdOrCtrl+B',
    description: 'Toggle bold text',
    enabled: true,
    global: false,
  },
  {
    action: 'toggle-italic',
    combo: 'CmdOrCtrl+I',
    description: 'Toggle italic text',
    enabled: true,
    global: false,
  },
  {
    action: 'toggle-underline',
    combo: 'CmdOrCtrl+U',
    description: 'Toggle underline text',
    enabled: true,
    global: false,
  },
  {
    action: 'insert-link',
    combo: 'CmdOrCtrl+K',
    description: 'Insert link',
    enabled: true,
    global: false,
  },
]

export async function setupDefaultShortcuts(shortcuts: TShortcut[]) {
  const existingActions = new Set(shortcuts.map(s => s.action))
  const newShortcuts: Record<string, any> = {}
  let createdCount = 0

  for (const defaultShortcut of DEFAULT_SHORTCUTS) {
    if (!existingActions.has(defaultShortcut.action)) {
      const id = generateId()
      const now = Date.now()
      newShortcuts[id] = {
        ...defaultShortcut,
        createdAt: now,
        updatedAt: now,
      }
      createdCount++
    }
  }

  if (createdCount > 0) {
    const updates = Object.entries(newShortcuts).map(([id, data]) =>
      tx.shortcuts[id].update(data)
    )
    await transact(updates)
  }
}

