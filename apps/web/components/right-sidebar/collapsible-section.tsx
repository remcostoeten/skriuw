'use client'

import { useCallback } from 'react'
import type { ReactNode } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { cn } from '@skriuw/shared'

type CollapsibleSectionProps = {
    /** Unique identifier for this section */
    id: string
    /** Section title */
    title: string
    /** Icon to display next to the title */
    icon: ReactNode
    /** Whether the section is currently expanded */
    isExpanded: boolean
    /** Callback when the section header is clicked */
    onToggle: (id: string) => void
    /** Content to render when expanded */
    children: ReactNode
    /** Optional className for the container */
    className?: string
}

export function CollapsibleSection({
    id,
    title,
    icon,
    isExpanded,
    onToggle,
    children,
    className,
}: CollapsibleSectionProps) {
    const handleToggle = useCallback(function handleToggle() {
        onToggle(id)
    }, [id, onToggle])

    return (
        <div className={cn('rounded-2xl border border-border/60 bg-muted/10', className)}>
            <button
                type="button"
                onClick={handleToggle}
                className="w-full flex items-center justify-between px-3 py-3 text-left hover:bg-white/5 transition-colors rounded-2xl"
                aria-expanded={isExpanded}
                aria-controls={`section-content-${id}`}
            >
                <div className="flex items-center gap-2">
                    <span className="w-4 h-4 flex-shrink-0">{icon}</span>
                    <span className="font-medium">{title}</span>
                </div>
                {isExpanded ? (
                    <ChevronDown className="w-4 h-4" />
                ) : (
                    <ChevronRight className="w-4 h-4" />
                )}
            </button>

            {isExpanded ? (
                <div id={`section-content-${id}`} className="px-3 pb-3">
                    {children}
                </div>
            ) : null}
        </div>
    )
}
