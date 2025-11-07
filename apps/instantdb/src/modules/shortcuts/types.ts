/**
 * Shortcut Types
 */
export type TShortcutAction =
  | 'toggle-left-sidebar'
  | 'toggle-right-sidebar'
  | 'open-preferences'
  | 'open-command-palette'
  | 'create-note'
  | 'create-folder'
  | 'save-note'
  | 'search-notes'
  | 'toggle-theme'
  | 'toggle-search'
  | 'toggle-folders'
  | 'new-note'
  | 'new-folder'
  | 'settings'
  | 'context-rename'
  | 'context-duplicate'
  | 'context-pin'
  | 'context-delete'
  | 'multi-select-add'
  | 'multi-select-range'
  | 'clear-selection'
  | 'toggle-bold'
  | 'toggle-italic'
  | 'toggle-underline'
  | 'insert-link'

export type TShortcut = {
  id: string
  action: TShortcutAction
  combo: string
  description: string
  enabled: boolean
  global: boolean
  createdAt: number
  updatedAt: number
}

export type ShortcutHandler = () => void

export interface ShortcutBinding {
  id: TShortcutAction
  handler: ShortcutHandler
}

