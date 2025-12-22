'use client'

import React from 'react'
import type { PreviewProps } from '../types'

type LayoutType = 'maxWidth' | 'centeredLayout'

interface LayoutPreviewProps extends PreviewProps {
    type: LayoutType
}

export default function LayoutPreview({ value, type }: LayoutPreviewProps) {
    const isCentered = type === 'centeredLayout' ? value : true // Assume centered for maxWidth preview

    function getWidthClass() {
        if (type === 'centeredLayout') return 'w-3/4' // Fixed width for centered toggle demo

        switch (value) {
            case 'narrow': return 'w-1/2'
            case 'medium': return 'w-3/4'
            case 'wide': return 'w-11/12'
            case 'full': return 'w-full'
            default: return 'w-full'
        }
    }

    return (
        <div className="mt-3 rounded-md overflow-hidden border border-border">
            <div className="text-xs text-muted-foreground px-3 py-1.5 bg-muted/50 border-b border-border flex items-center justify-between">
                <span>Preview</span>
                <span className="font-medium">{String(value)}</span>
            </div>
            <div className="bg-background-secondary p-4 h-32 flex items-center justify-center relative">
                {/* Window Frame */}
                <div className="w-full h-full border-2 border-dashed border-muted-foreground/20 rounded flex relative bg-background">
                    {/* Content Area */}
                    <div
                        className={`h-full bg-primary/10 border-x border-primary/20 transition-all duration-300 flex flex-col gap-2 p-2 ${getWidthClass()}`}
                        style={{
                            margin: isCentered ? '0 auto' : '0 0 0 0'
                        }}
                    >
                        <div className="h-2 w-3/4 bg-primary/20 rounded" />
                        <div className="h-2 w-full bg-primary/20 rounded" />
                        <div className="h-2 w-5/6 bg-primary/20 rounded" />
                        <div className="h-2 w-full bg-primary/20 rounded" />
                    </div>
                </div>
            </div>
        </div>
    )
}
