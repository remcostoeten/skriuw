'use client'

import * as React from 'react'
import { useShortcutMap } from '@remcostoeten/use-shortcut/react'
import { DEFAULT_ACTIVE_SCOPES } from './scopes'
import { SHORTCUT_REGISTRY, type ShortcutId } from './registry'
import { buildShortcutMap } from './runtime'
import { loadBindings, saveBindings } from './storage'
import type { ShortcutHandlers, ShortcutBindings } from './types'

interface ShortcutContextValue {
  activeScopes: string[]
  bindings: ShortcutBindings
  enableScope: (scope: string) => void
  disableScope: (scope: string) => void
  setBinding: (id: ShortcutId, key: string) => void
  registry: typeof SHORTCUT_REGISTRY
}

const ShortcutContext = React.createContext<ShortcutContextValue | null>(null)

interface ShortcutProviderProps {
  children: React.ReactNode
  handlers: ShortcutHandlers
}

function buildShortcutMapForLibrary(
  bindings: ShortcutBindings,
  handlers: ShortcutHandlers,
  activeScopes: string[],
) {
  type ShortcutMapEntry = {
    keys: string | string[]
    handler: () => void
  }
  
  const shortcutMap: Record<string, ShortcutMapEntry> = {}
  
  for (const [id, meta] of Object.entries(SHORTCUT_REGISTRY) as [ShortcutId, typeof SHORTCUT_REGISTRY[ShortcutId]][]) {
    const handler = handlers[id]
    if (!handler) continue
    if (!activeScopes.includes(meta.scope)) continue

    const key = bindings[id] ?? meta.key
    shortcutMap[id] = { keys: key, handler }
  }

  return shortcutMap as Record<string, ShortcutMapEntry>
}

export function ShortcutProvider({ children, handlers }: ShortcutProviderProps) {
  const [activeScopes, setActiveScopes] = React.useState<string[]>(DEFAULT_ACTIVE_SCOPES)
  const [bindings, setBindings] = React.useState<ShortcutBindings>(() => loadBindings())

  const shortcutMap = React.useMemo(
    () => buildShortcutMapForLibrary(bindings, handlers, activeScopes),
    [bindings, handlers, activeScopes],
  )

  useShortcutMap(shortcutMap as any, { activeScopes })

  const enableScope = React.useCallback((scope: string) => {
    setActiveScopes(prev => prev.includes(scope) ? prev : [...prev, scope])
  }, [])

  const disableScope = React.useCallback((scope: string) => {
    setActiveScopes(prev => prev.filter(s => s !== scope))
  }, [])

  const setBinding = React.useCallback((id: ShortcutId, key: string) => {
    setBindings(prev => {
      const next = { ...prev, [id]: key }
      saveBindings(next)
      return next
    })
  }, [])

  const value = React.useMemo<ShortcutContextValue>(() => ({
    activeScopes,
    bindings,
    enableScope,
    disableScope,
    setBinding,
    registry: SHORTCUT_REGISTRY,
  }), [activeScopes, bindings, enableScope, disableScope, setBinding])

  return (
    <ShortcutContext.Provider value={value}>
      {children}
    </ShortcutContext.Provider>
  )
}

export function useShortcutManager(): ShortcutContextValue {
  const ctx = React.useContext(ShortcutContext)
  if (!ctx) throw new Error('useShortcutManager must be used inside <ShortcutProvider>')
  return ctx
}