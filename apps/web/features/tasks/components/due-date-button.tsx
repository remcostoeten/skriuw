'use client'

import { useState } from 'react'
import { Calendar, X } from 'lucide-react'

import { cn } from '@skriuw/core-logic'
import { Button } from '@skriuw/ui/button'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@skriuw/ui/popover'
import { Calendar as CalendarComponent } from '@skriuw/ui/calendar'

interface DueDateButtonProps {
    dueDate: number | null
    onUpdate: (dueDate: number | null) => void
    className?: string
}

function formatDueDate(timestamp: number): string {
    const date = new Date(timestamp)
    const now = new Date()
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)

    if (
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate()
    ) {
        return 'Today'
    }

    if (
        date.getFullYear() === tomorrow.getFullYear() &&
        date.getMonth() === tomorrow.getMonth() &&
        date.getDate() === tomorrow.getDate()
    ) {
        return 'Tomorrow'
    }

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getDueDateColor(timestamp: number | null): string {
    if (!timestamp) return 'text-muted-foreground'

    const date = new Date(timestamp)
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    date.setHours(0, 0, 0, 0)

    if (date < now) return 'text-red-400'
    if (date.getTime() === now.getTime()) return 'text-orange-400'
    return 'text-blue-400'
}

export function DueDateButton({ dueDate, onUpdate, className }: DueDateButtonProps) {
    const [open, setOpen] = useState(false)

    const handleSelect = (date: Date | undefined) => {
        if (date) {
            date.setHours(23, 59, 59, 999)
            onUpdate(date.getTime())
        }
        setOpen(false)
    }

    const handleClear = (e: React.MouseEvent) => {
        e.stopPropagation()
        onUpdate(null)
        setOpen(false)
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                        'h-7 gap-1.5 px-2 text-xs font-normal rounded-full',
                        'hover:bg-muted/80 transition-colors',
                        getDueDateColor(dueDate),
                        className
                    )}
                >
                    <Calendar className="h-3.5 w-3.5" />
                    <span>{dueDate ? formatDueDate(dueDate) : 'Due date'}</span>
                    {dueDate && (
                        <span
                            role="button"
                            onClick={handleClear}
                            className="ml-0.5 p-0.5 rounded-full hover:bg-muted-foreground/20"
                        >
                            <X className="h-3 w-3" />
                        </span>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                    mode="single"
                    selected={dueDate ? new Date(dueDate) : undefined}
                    onSelect={handleSelect}
                    initialFocus
                />
            </PopoverContent>
        </Popover>
    )
}
