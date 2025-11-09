/**
 * @name Shortcut Provider
 * @description Initializes shortcuts system
 */

'use client'

import { useEffect } from 'react'
import { useGetShortcuts } from './api/queries/get-shortcuts'
import { setupDefaultShortcuts } from './defaults'
import { useGlobalShortcuts } from './hooks'

export function ShortcutProvider({ children }: { children: Children }) {
  const { shortcuts, loading } = useGetShortcuts()

  /**
   * @description Initialize default shortcuts
   */
  useEffect(() => {
    if (loading) return
    setupDefaultShortcuts(shortcuts).catch(console.error)
  }, [shortcuts, loading])

  useGlobalShortcuts()

  return <>{children}</>
}

