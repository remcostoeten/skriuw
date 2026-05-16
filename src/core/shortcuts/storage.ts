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

    const parsed = JSON.parse(stored)

    // Ensure parsed value is a plain object (not null, not an array)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return defaults
    }

    // Only accept known shortcut IDs with string values
    const sanitized: Partial<ShortcutBindings> = {}
    for (const [id, value] of Object.entries(parsed)) {
      if (!(id in defaults)) continue
      if (typeof value !== 'string') continue
      sanitized[id as keyof ShortcutBindings] = value
    }

    return { ...defaults, ...sanitized }
  } catch {
    return defaults
  }
}

export function saveBindings(bindings: ShortcutBindings): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings))
}