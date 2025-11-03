'use client'

import { useEffect } from 'react'
import { setupDefaultShortcuts } from '@/lib/shortcuts'

type ShortcutProviderProps = {
  children: React.ReactNode
}

export function ShortcutProvider({ children }: ShortcutProviderProps) {
  useEffect(() => {
    console.log('[ShortcutProvider] Initializing shortcuts...')
    setupDefaultShortcuts()
      .then(() => console.log('[ShortcutProvider] Shortcuts initialized successfully'))
      .catch((error) => console.error('[ShortcutProvider] Failed to initialize shortcuts:', error))
  }, [])

  return <>{children}</>
}
