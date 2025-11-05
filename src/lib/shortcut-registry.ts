/**
 * Central Shortcut Registry
 * Unified system for managing all keyboard shortcuts in the application
 */

import { isTauri } from '@/utils/native-utils'
import { invoke } from '@tauri-apps/api/core'

export type ShortcutPriority = 'global' | 'context' | 'local'

export interface ShortcutDefinition {
  id: string
  action: string
  key: string
  enabled: boolean
  priority: ShortcutPriority
  context?: string // e.g., 'file-tree', 'editor', 'context-menu'
  description?: string
  userDefined?: boolean
}

export interface ShortcutConflict {
  key: string
  shortcuts: ShortcutDefinition[]
}

export interface ShortcutRegistry {
  // Core shortcuts that should always be available
  [key: string]: ShortcutDefinition
}

// Default shortcut definitions
export const DEFAULT_SHORTCUTS: ShortcutRegistry = {
  'toggle-search': {
    id: 'toggle-search',
    action: 'toggle-search',
    key: 'CmdOrCtrl+F',
    enabled: true,
    priority: 'global',
    description: 'Toggle search panel'
  },
  'new-note': {
    id: 'new-note',
    action: 'new-note',
    key: 'CmdOrCtrl+N',
    enabled: true,
    priority: 'global',
    description: 'Create new note'
  },
  'toggle-folders': {
    id: 'toggle-folders',
    action: 'toggle-folders',
    key: 'CmdOrCtrl+0',
    enabled: true,
    priority: 'global',
    description: 'Toggle folders panel'
  },
  // Context menu shortcuts
  'context-rename': {
    id: 'context-rename',
    action: 'context-rename',
    key: 'Shift+R',
    enabled: true,
    priority: 'context',
    context: 'file-tree',
    description: 'Rename selected item'
  },
  'context-duplicate': {
    id: 'context-duplicate',
    action: 'context-duplicate',
    key: 'Shift+D',
    enabled: true,
    priority: 'context',
    context: 'file-tree',
    description: 'Duplicate selected item'
  },
  'context-pin': {
    id: 'context-pin',
    action: 'context-pin',
    key: 'Shift+P',
    enabled: true,
    priority: 'context',
    context: 'file-tree',
    description: 'Pin/unpin selected item'
  },
  'context-delete': {
    id: 'context-delete',
    action: 'context-delete',
    key: 'Shift+Backspace',
    enabled: true,
    priority: 'context',
    context: 'file-tree',
    description: 'Delete selected item'
  },
  // Multi-select shortcuts
  'multi-select-add': {
    id: 'multi-select-add',
    action: 'multi-select-add',
    key: 'Ctrl+Click',
    enabled: true,
    priority: 'context',
    context: 'file-tree',
    description: 'Add item to selection (Ctrl+Click)'
  },
  'multi-select-range': {
    id: 'multi-select-range',
    action: 'multi-select-range',
    key: 'Shift+Click',
    enabled: true,
    priority: 'context',
    context: 'file-tree',
    description: 'Select range (Shift+Click)'
  },
  'clear-selection': {
    id: 'clear-selection',
    action: 'clear-selection',
    key: 'Escape',
    enabled: true,
    priority: 'context',
    context: 'file-tree',
    description: 'Clear selection'
  }
}

class ShortcutRegistryManager {
  private static instance: ShortcutRegistryManager
  private shortcuts: Map<string, ShortcutDefinition> = new Map()
  private userShortcuts: Map<string, ShortcutDefinition> = new Map()
  private eventHandlers: Map<string, (() => void)[]> = new Map()
  private modifierState = {
    ctrl: false,
    shift: false,
    alt: false,
    meta: false
  }

  private constructor() {
    this.initializeDefaults()
  }

  static getInstance(): ShortcutRegistryManager {
    if (!ShortcutRegistryManager.instance) {
      ShortcutRegistryManager.instance = new ShortcutRegistryManager()
    }
    return ShortcutRegistryManager.instance
  }

  private initializeDefaults() {
    Object.values(DEFAULT_SHORTCUTS).forEach(shortcut => {
      this.shortcuts.set(shortcut.id, shortcut)
    })
  }

  /**
   * Get all shortcuts, including user-defined ones
   */
  getAllShortcuts(): ShortcutDefinition[] {
    const all = new Map(this.shortcuts)
    // Override defaults with user-defined shortcuts
    this.userShortcuts.forEach((userShortcut, id) => {
      all.set(id, userShortcut)
    })
    return Array.from(all.values())
  }

  /**
   * Get shortcuts by context
   */
  getShortcutsByContext(context?: string): ShortcutDefinition[] {
    return this.getAllShortcuts().filter(shortcut =>
      !context || shortcut.context === context || shortcut.priority === 'global'
    )
  }

  /**
   * Get shortcuts by priority
   */
  getShortcutsByPriority(priority: ShortcutPriority): ShortcutDefinition[] {
    return this.getAllShortcuts().filter(shortcut => shortcut.priority === priority)
  }

  /**
   * Find conflicts between shortcuts
   */
  findConflicts(): ShortcutConflict[] {
    const conflicts: ShortcutConflict[] = []
    const keyMap = new Map<string, ShortcutDefinition[]>()

    this.getAllShortcuts().forEach(shortcut => {
      if (shortcut.enabled) {
        if (!keyMap.has(shortcut.key)) {
          keyMap.set(shortcut.key, [])
        }
        keyMap.get(shortcut.key)!.push(shortcut)
      }
    })

    keyMap.forEach((shortcuts, key) => {
      if (shortcuts.length > 1) {
        conflicts.push({ key, shortcuts })
      }
    })

    return conflicts
  }

  /**
   * Update a shortcut (user-defined)
   */
  updateShortcut(id: string, updates: Partial<ShortcutDefinition>): boolean {
    const existing = this.shortcuts.get(id) || this.userShortcuts.get(id)
    if (!existing) {
      console.warn(`[ShortcutRegistry] Shortcut with id "${id}" not found`)
      return false
    }

    const updated: ShortcutDefinition = {
      ...existing,
      ...updates,
      id,
      userDefined: true
    }

    // Check for conflicts
    const conflicts = this.findConflicts()
    const newConflict = conflicts.find(conflict =>
      conflict.key === updated.key &&
      !conflict.shortcuts.some(s => s.id === id)
    )

    if (newConflict) {
      console.warn(`[ShortcutRegistry] Conflict detected for key "${updated.key}" with:`,
        newConflict.shortcuts.map(s => s.id))
      // Still allow the update but warn the user
    }

    this.userShortcuts.set(id, updated)

    // If in Tauri environment, sync with backend
    if (isTauri) {
      this.syncWithTauri(updated)
    }

    this.notifyHandlers('shortcut-updated', id)
    return true
  }

  /**
   * Add event listener for shortcut registry changes
   */
  addEventListener(event: 'shortcut-updated' | 'shortcut-conflict', handler: () => void): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, [])
    }
    this.eventHandlers.get(event)!.push(handler)
  }

  /**
   * Remove event listener
   */
  removeEventListener(event: string, handler: () => void): void {
    const handlers = this.eventHandlers.get(event)
    if (handlers) {
      const index = handlers.indexOf(handler)
      if (index > -1) {
        handlers.splice(index, 1)
      }
    }
  }

  private notifyHandlers(event: string, data?: any): void {
    const handlers = this.eventHandlers.get(event)
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler()
        } catch (error) {
          console.error(`[ShortcutRegistry] Error in event handler for ${event}:`, error)
        }
      })
    }
  }

  /**
   * Sync user-defined shortcut with Tauri backend
   */
  private async syncWithTauri(shortcut: ShortcutDefinition): Promise<void> {
    if (!isTauri) return

    try {
      // Check if shortcut already exists in Tauri
      const existingShortcuts = await invoke<any[]>('get_shortcuts')
      const existing = existingShortcuts.find((s: any) => s.action === shortcut.action)

      if (existing) {
        await invoke('update_shortcut', {
          id: existing.id,
          config: {
            id: existing.id,
            key: shortcut.key,
            action: shortcut.action,
            enabled: shortcut.enabled
          }
        })
      } else {
        await invoke('create_shortcut', {
          config: {
            id: crypto.randomUUID(),
            key: shortcut.key,
            action: shortcut.action,
            enabled: shortcut.enabled
          }
        })
      }

      console.log(`[ShortcutRegistry] Synced shortcut "${shortcut.id}" with Tauri`)
    } catch (error) {
      console.error(`[ShortcutRegistry] Failed to sync shortcut "${shortcut.id}" with Tauri:`, error)
    }
  }

  /**
   * Load user shortcuts from Tauri backend
   */
  async loadFromTauri(): Promise<void> {
    if (!isTauri) return

    try {
      const shortcuts = await invoke<any[]>('get_shortcuts')
      console.log(`[ShortcutRegistry] Loading ${shortcuts.length} shortcuts from Tauri`)

      shortcuts.forEach((tauriShortcut: any) => {
        const defaultShortcut = this.shortcuts.get(tauriShortcut.action)
        if (defaultShortcut) {
          this.userShortcuts.set(tauriShortcut.action, {
            ...defaultShortcut,
            key: tauriShortcut.key,
            enabled: tauriShortcut.enabled,
            userDefined: true
          })
        }
      })
    } catch (error) {
      console.error('[ShortcutRegistry] Failed to load shortcuts from Tauri:', error)
    }
  }

  /**
   * Reset all shortcuts to defaults
   */
  resetToDefaults(): void {
    this.userShortcuts.clear()
    this.notifyHandlers('shortcut-updated')
    console.log('[ShortcutRegistry] Reset all shortcuts to defaults')
  }

  /**
   * Export shortcuts for backup
   */
  exportShortcuts(): string {
    const exportData = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      userShortcuts: Array.from(this.userShortcuts.entries())
    }
    return JSON.stringify(exportData, null, 2)
  }

  /**
   * Import shortcuts from backup
   */
  importShortcuts(jsonData: string): boolean {
    try {
      const data = JSON.parse(jsonData)
      if (data.version && data.userShortcuts) {
        this.userShortcuts.clear()
        data.userShortcuts.forEach(([id, shortcut]: [string, ShortcutDefinition]) => {
          this.userShortcuts.set(id, shortcut)
        })
        this.notifyHandlers('shortcut-updated')
        console.log('[ShortcutRegistry] Successfully imported shortcuts')
        return true
      }
    } catch (error) {
      console.error('[ShortcutRegistry] Failed to import shortcuts:', error)
    }
    return false
  }
}

// Export singleton instance
export const shortcutRegistry = ShortcutRegistryManager.getInstance()

// Export convenience functions
export const getAllShortcuts = () => shortcutRegistry.getAllShortcuts()
export const getShortcutsByContext = (context?: string) => shortcutRegistry.getShortcutsByContext(context)
export const updateShortcut = (id: string, updates: Partial<ShortcutDefinition>) =>
  shortcutRegistry.updateShortcut(id, updates)
export const findShortcutConflicts = () => shortcutRegistry.findConflicts()
export const resetShortcutsToDefaults = () => shortcutRegistry.resetToDefaults()
export const loadShortcutsFromTauri = () => shortcutRegistry.loadFromTauri()