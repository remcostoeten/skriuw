'use client'

import React, { useEffect, useState } from 'react'
import { Command } from 'cmdk'
import { Search } from 'lucide-react'
import { getAllCommands } from '@/features/commands/registry'
import { executeCommand } from '@/features/commands/executor'

export function CommandPalette({ isOpen, onClose }: { isOpen?: boolean; onClose?: () => void }) {
    const [open, setOpen] = useState(false)
    const [commands, setCommands] = useState(getAllCommands())

    useEffect(() => {
        // Registry initialization might happen after mount, so we can poll or listen?
        // For now, assume initialized by Provider
        setCommands(getAllCommands())

        // Listen for custom toggle event from Registry
        const toggle = () => setOpen(o => !o)
        window.addEventListener('skriuw:palette:toggle', toggle)

        // Also support Cmd+K as standard alternative
        const down = (e: KeyboardEvent) => {
            if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                setOpen((open) => !open)
            }
        }
        document.addEventListener('keydown', down)

        return () => {
            window.removeEventListener('skriuw:palette:toggle', toggle)
            document.removeEventListener('keydown', down)
        }
    }, [])

    // Sync prop if provided
    useEffect(() => {
        if (isOpen !== undefined) setOpen(isOpen)
    }, [isOpen])

    // On close callback
    useEffect(() => {
        if (!open && onClose) onClose()
    }, [open, onClose])

    // Apply inert to main content when palette is open
    useEffect(() => {
        const mainContent = document.getElementById('main-content')
        if (mainContent) {
            if (open) {
                mainContent.setAttribute('inert', '')
            } else {
                mainContent.removeAttribute('inert')
            }
        }
        return () => {
            mainContent?.removeAttribute('inert')
        }
    }, [open])

    if (!open) return null

    return (
        <div
            className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh]"
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
        >
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-background/80 backdrop-blur-sm"
                onClick={() => setOpen(false)}
                aria-hidden="true"
            />

            {/* Content */}
            <div className="relative w-full max-w-[640px] overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl animate-in fade-in zoom-in-95 duration-200 mx-4">
                <Command
                    label="Command Menu"
                    loop
                    className="flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground"
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                            setOpen(false)
                        }
                    }}
                >
                    <div className="flex items-center border-b px-3">
                        <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                        <Command.Input
                            autoFocus
                            className="flex h-12 w-full rounded-md bg-transparent py-3 text-sm outline-none border-0 ring-0 focus:outline-none focus:ring-0 focus:border-0 focus-visible:ring-0 focus-visible:outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                            placeholder="Type a command or search..."
                        />
                    </div>
                    <Command.List className="max-h-[300px] overflow-y-auto overflow-x-hidden p-1">
                        <Command.Empty className="py-6 text-center text-sm text-muted-foreground">No matching commands found.</Command.Empty>
                        {commands.map((cmd) => (
                            <Command.Item
                                key={cmd.id}
                                value={`${cmd.label} ${cmd.category} ${cmd.description || ''}`}
                                onSelect={() => {
                                    setOpen(false)
                                    executeCommand(cmd.id)
                                }}
                                className="relative flex cursor-default select-none items-center rounded-sm px-2 py-2 text-sm outline-none aria-selected:bg-accent aria-selected:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                            >
                                <span className="mr-3 flex h-5 w-5 items-center justify-center opacity-70">
                                    {cmd.icon ? <span>{cmd.icon}</span> : <div className="w-1.5 h-1.5 rounded-full bg-current" />}
                                </span>
                                <div className="flex flex-col gap-0.5">
                                    <span className="font-medium">{cmd.label}</span>
                                    {cmd.description && <span className="text-[10px] text-muted-foreground">{cmd.description}</span>}
                                </div>
                                {cmd.category && <span className="ml-auto text-[10px] text-muted-foreground opacity-50 bg-muted px-1.5 rounded-sm">{cmd.category}</span>}
                            </Command.Item>
                        ))}
                    </Command.List>
                </Command>
            </div>
        </div>
    )
}
