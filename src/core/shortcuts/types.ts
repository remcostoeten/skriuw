import type { ShortcutId } from './registry'
import type { SHORTCUT_REGISTRY } from './registry'

export type ShortcutHandlers = Partial<Record<ShortcutId, () => void>>

export type ShortcutBindings = Record<ShortcutId, string>

export interface ShortcutState {
  activeScopes: string[]
  bindings: ShortcutBindings
}

export interface ShortcutActions {
  enableScope: (scope: string) => void
  disableScope: (scope: string) => void
  setBinding: (id: ShortcutId, key: string) => void
}

export interface ShortcutMeta {
  registry: typeof SHORTCUT_REGISTRY
}