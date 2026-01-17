'use client'

import { useCallback } from 'react'
import { Edit3, Eye } from 'lucide-react'
import { cn, haptic } from '@skriuw/shared'
import { useMediaQuery, MOBILE_BREAKPOINT } from '@skriuw/shared/client'

type EditorModeIndicatorProps = {
    isEditing: boolean
    onToggle: () => void
    className?: string
}

export function EditorModeIndicator({
    isEditing,
    onToggle,
    className
}: EditorModeIndicatorProps) {
    const isMobile = useMediaQuery(MOBILE_BREAKPOINT)

    const handleClick = useCallback(() => {
        haptic.medium()
        onToggle()
    }, [onToggle])

    // Only show on mobile
    if (!isMobile) return null

    return (
        <button
            type="button"
            onClick={handleClick}
            className={cn(
                'fixed z-[60]',
                // Position: top right, below any header
                'top-3 right-3',
                // Pill styling
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full',
                'bg-[#1a1a1a]/90 backdrop-blur-lg',
                'border border-white/[0.08]',
                'shadow-lg shadow-black/20',
                // Text styling
                'text-xs font-medium',
                isEditing ? 'text-emerald-400' : 'text-white/60',
                // Interaction
                'transition-all duration-200 ease-out',
                'active:scale-95',
                'touch-manipulation select-none',
                className
            )}
            aria-label={isEditing ? 'Switch to reading mode' : 'Switch to editing mode'}
            aria-pressed={isEditing}
        >
            {isEditing ? (
                <>
                    <Edit3 className="w-3.5 h-3.5" strokeWidth={2} />
                    <span>Editing</span>
                </>
            ) : (
                <>
                    <Eye className="w-3.5 h-3.5" strokeWidth={2} />
                    <span>Reading</span>
                </>
            )}
        </button>
    )
}
