'use client'

import { useEffect } from 'react'
import { setupDefaultShortcuts } from '@/lib/shortcuts'

type ShortcutProviderProps = {
  children: React.ReactNode
}

export function ShortcutProvider({ children }: ShortcutProviderProps) {
  useEffect(() => {
    setupDefaultShortcuts()
  }, [])

  return <>{children}</>
}
