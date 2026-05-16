import { SHORTCUT_REGISTRY, type ShortcutId } from './registry'
import type { ShortcutBindings } from './types'

const STORAGE_KEY = 'shortcut-bindings'

export function loadBindings(): ShortcutBindings {
  const defaults = Object.fromEntries(
    Object.entries(SHORTCUT_REGISTRY).map(([id, meta]) => [id, meta.key])
  ) as ShortcutBindings

  if (typeof window === 'undefined') return defaults

  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return defaults
    return { ...defaults, ...JSON.parse(stored) }
  } catch {
    return defaults
  }
}

export function saveBindings(bindings: ShortcutBindings): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings))
}