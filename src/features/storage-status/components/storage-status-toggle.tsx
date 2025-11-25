import { Database, GripVertical } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'

import { Button } from '@/shared/ui/button'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger
} from '@/shared/ui/tooltip'

interface StorageStatusToggleProps {
    onClick: () => void
}

interface DragPosition {
    x: number
    y: number
}

const STORAGE_KEY = 'data-browser-toggle-position'
const DEFAULT_POSITION = { x: window.innerWidth - 80, y: window.innerHeight - 80 }

export function StorageStatusToggle({ onClick }: StorageStatusToggleProps) {
    const [position, setPosition] = useState<DragPosition>(DEFAULT_POSITION)
    const [isDragging, setIsDragging] = useState(false)
    const [hasDragged, setHasDragged] = useState(false)
    const [isHovered, setIsHovered] = useState(false)
    const dragRef = useRef<{ startX: number; startY: number; startPos: DragPosition } | null>(null)

    // Load position from localStorage on mount
    useEffect(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY)
            if (saved) {
                const savedPos = JSON.parse(saved) as DragPosition
                // Ensure position is within viewport bounds
                const boundedPos = {
                    x: Math.max(0, Math.min(window.innerWidth - 60, savedPos.x)),
                    y: Math.max(0, Math.min(window.innerHeight - 60, savedPos.y))
                }
                setPosition(boundedPos)
            }
        } catch (error) {
            console.warn('Failed to load toggle position:', error)
        }
    }, [])

    // Save position to localStorage when it changes
    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(position))
        } catch (error) {
            console.warn('Failed to save toggle position:', error)
        }
    }, [position])

    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()

        dragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            startPos: { ...position }
        }
        setIsDragging(true)
        setHasDragged(false)
    }

    useEffect(() => {
        if (!isDragging) return

        const handleMouseMove = (e: MouseEvent) => {
            if (!dragRef.current) return

            const deltaX = e.clientX - dragRef.current.startX
            const deltaY = e.clientY - dragRef.current.startY

            // Consider it a drag if moved more than 3px in any direction
            if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
                setHasDragged(true)
            }

            const newX = dragRef.current.startPos.x + deltaX
            const newY = dragRef.current.startPos.y + deltaY

            // Keep within viewport bounds
            const boundedX = Math.max(0, Math.min(window.innerWidth - 60, newX))
            const boundedY = Math.max(0, Math.min(window.innerHeight - 60, newY))

            setPosition({ x: boundedX, y: boundedY })
        }

        const handleMouseUp = () => {
            setIsDragging(false)
            dragRef.current = null
            // Reset hasDragged after a short delay to allow click events to be processed
            setTimeout(() => setHasDragged(false), 50)
        }

        document.addEventListener('mousemove', handleMouseMove)
        document.addEventListener('mouseup', handleMouseUp)

        return () => {
            document.removeEventListener('mousemove', handleMouseMove)
            document.removeEventListener('mouseup', handleMouseUp)
        }
    }, [isDragging])

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <div
                        className="fixed z-40"
                        style={{
                            left: `${position.x}px`,
                            top: `${position.y}px`,
                            cursor: isDragging ? 'grabbing' : 'grab'
                        }}
                    >
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={(e) => {
                                // Only trigger onClick if we haven't dragged
                                if (!hasDragged && !isDragging) {
                                    onClick()
                                }
                            }}
                            onMouseDown={handleMouseDown}
                            onMouseEnter={() => setIsHovered(true)}
                            onMouseLeave={() => setIsHovered(false)}
                            className={`
                                h-12 w-12 rounded-full shadow-lg hover:shadow-xl transition-all duration-200
                                ${isDragging ? 'scale-110 shadow-2xl' : ''}
                                ${isHovered && !isDragging ? 'ring-2 ring-brand-500/30' : ''}
                            `}
                        >
                            <Database className="h-5 w-5" />
                        </Button>

                        {/* Drag indicator */}
                        <div className="
                            absolute -top-1 -right-1
                            w-4 h-4 rounded-full
                            bg-muted border border-border
                            flex items-center justify-center
                            opacity-0 group-hover:opacity-100 transition-opacity
                            pointer-events-none
                        "
                            style={{ opacity: isHovered ? 1 : 0 }}
                        >
                            <GripVertical className="w-2 h-2 text-muted-foreground" />
                        </div>
                    </div>
                </TooltipTrigger>
                <TooltipContent side="left">
                    <p>Data Browser {isHovered && '(draggable)'}</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}
