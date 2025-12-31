'use client'

import React, { useRef, useState, useEffect } from 'react'
import { motion, useAnimation, PanInfo } from 'framer-motion'
import { Trash2, Pin } from 'lucide-react'
import { cn } from '@skriuw/shared'

interface SwipeableItemProps {
    children: React.ReactNode
    onDelete?: () => void
    onPin?: () => void
    isPinned?: boolean
    disabled?: boolean
    className?: string
}

export function SwipeableItem({
    children,
    onDelete,
    onPin,
    isPinned,
    disabled = false,
    className
}: SwipeableItemProps) {
    const controls = useAnimation()
    const [action, setAction] = useState<'none' | 'delete' | 'pin'>('none')
    const dragConstrainsRef = useRef<HTMLDivElement>(null)

    // Thresholds for triggering actions
    const DELETE_THRESHOLD = -80
    const PIN_THRESHOLD = 80

    async function handleDragEnd(_: any, info: PanInfo) {
        if (disabled) return

        const offset = info.offset.x

        if (offset < DELETE_THRESHOLD && onDelete) {
            // Trigger delete
            setAction('delete')
            await controls.start({ x: -1000, opacity: 0 })
            onDelete()
            // Reset position if delete is cancelled or handled elsewhere without unmounting
            setTimeout(() => {
                controls.start({ x: 0, opacity: 1 })
                setAction('none')
            }, 300)
        } else if (offset > PIN_THRESHOLD && onPin) {
            // Trigger pin
            setAction('pin')
            await controls.start({ x: 0 }) // Snap back
            onPin()
            setAction('none')
        } else {
            // Snap back
            controls.start({ x: 0 })
            setAction('none')
        }
    }

    function handleDrag(_: any, info: PanInfo) {
        if (disabled) return

        const offset = info.offset.x
        if (offset < DELETE_THRESHOLD && onDelete) {
            if (action !== 'delete') setAction('delete')
        } else if (offset > PIN_THRESHOLD && onPin) {
            if (action !== 'pin') setAction('pin')
        } else {
            if (action !== 'none') setAction('none')
        }
    }

    return (
        <div className={cn("relative overflow-hidden", className)}>
            {/* Background Actions */}
            <div className="absolute inset-0 flex items-center justify-between pointer-events-none">
                {/* Pin Action (Left Side) */}
                <div
                    className={cn(
                        "h-full flex items-center justify-start pl-4 transition-colors duration-200 w-1/2",
                        action === 'pin' ? "bg-blue-500/20 text-blue-500" : "bg-transparent text-transparent"
                    )}
                >
                    <Pin className={cn("w-5 h-5", isPinned && "fill-current")} />
                </div>

                {/* Delete Action (Right Side) */}
                <div
                    className={cn(
                        "h-full flex items-center justify-end pr-4 transition-colors duration-200 w-1/2 ml-auto",
                        action === 'delete' ? "bg-red-500/20 text-red-500" : "bg-transparent text-transparent"
                    )}
                >
                    <Trash2 className="w-5 h-5" />
                </div>
            </div>

            {/* Foreground Content */}
            <motion.div
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.1}
                onDrag={handleDrag}
                onDragEnd={handleDragEnd}
                animate={controls}
                className="relative bg-background touch-pan-y"
            >
                {children}
            </motion.div>
        </div>
    )
}
