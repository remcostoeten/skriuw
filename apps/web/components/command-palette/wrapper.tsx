'use client'

import dynamic from 'next/dynamic'

const CommandPalette = dynamic(() => import('./index').then(mod => mod.CommandPalette), { ssr: false })

export function CommandPaletteWrapper() {
    return <CommandPalette onClose={() => { }} />
}
