'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { X, Search } from 'lucide-react'
import { shortcutDefinitions, type ShortcutId } from '@/features/shortcuts/shortcut-definitions'
import { useShortcut } from '@/features/shortcuts/use-shortcut'

// Simple fuzzy search implementation
function fuzzyMatch(query: string, text: string): number {
    if (!query) return 1

    query = query.toLowerCase()
    text = text.toLowerCase()

    let score = 0
    let queryIndex = 0
    let textIndex = 0

    // Exact match gets highest score
    if (text.includes(query)) {
        score += 100
        textIndex = text.indexOf(query)
        queryIndex = query.length
    }

    // Continue with fuzzy matching
    while (queryIndex < query.length && textIndex < text.length) {
        if (query[queryIndex] === text[textIndex]) {
            score += 10
            queryIndex++
        } else {
            score -= 1 // penalty for mismatch
        }
        textIndex++
    }

    // Bonus for completing the query
    if (queryIndex === query.length) {
        score += 50
    }

    // Penalty for remaining query characters
    score -= (query.length - queryIndex) * 10

    return Math.max(0, score)
}

function filterCommands(commands: Array<{id: ShortcutId; description: string; keys: string}>, query: string) {
    if (!query.trim()) return commands

    return commands
        .map(command => ({
            ...command,
            score: fuzzyMatch(query, command.description)
        }))
        .filter(command => command.score > 0)
        .sort((a, b) => b.score - a.score)
}

type CommandGroup = {
    title: string
    commands: Array<{
        id: ShortcutId
        description: string
        keys: string
    }>
}

function formatKeys(keys: string[][]): string {
    // Take the first key combination and format it nicely
    const combo = keys[0]
    if (!combo) return ''

    return combo
        .map((key) => {
            // Replace Meta with ⌘ and Ctrl with Ctrl for display
            if (key === 'Meta') return '⌘'
            if (key === 'Ctrl') return 'Ctrl'
            if (key === 'Alt') return 'Alt'
            if (key === 'Shift') return 'Shift'
            if (key === 'ArrowLeft') return '←'
            if (key === 'ArrowRight') return '→'
            if (key === 'ArrowUp') return '↑'
            if (key === 'ArrowDown') return '↓'
            return key
        })
        .join('+')
}

function groupCommands(): CommandGroup[] {
    const groups: CommandGroup[] = [
        { title: 'Navigation', commands: [] },
        { title: 'File Operations', commands: [] },
        { title: 'Split View', commands: [] },
        { title: 'Other', commands: [] },
    ]

    const navigationIds: ShortcutId[] = [
        'editor-focus',
        'toggle-shortcuts',
        'toggle-sidebar',
        'open-settings',
        'open-collection',
    ]
    const fileIds: ShortcutId[] = ['create-note', 'create-folder', 'rename-item', 'delete-item', 'pin-item']
    const splitIds: ShortcutId[] = [
        'split.toggle',
        'split.swap',
        'split.orientation.next',
        'split.focus.left',
        'split.focus.right',
        'split.close',
        'split.cycle',
    ]

    Object.entries(shortcutDefinitions).forEach(([id, def]) => {
        const shortcutId = id as ShortcutId

        // Skip the command executor itself
        if (shortcutId === 'command-executor') return
        if (!def.enabled) return

        const command = {
            id: shortcutId,
            description: def.description || id,
            keys: formatKeys(def.keys),
        }

        if (navigationIds.includes(shortcutId)) {
            groups[0].commands.push(command)
        } else if (fileIds.includes(shortcutId)) {
            groups[1].commands.push(command)
        } else if (splitIds.includes(shortcutId)) {
            groups[2].commands.push(command)
        } else {
            groups[3].commands.push(command)
        }
    })

    // Filter out empty groups
    return groups.filter((g) => g.commands.length > 0)
}

export function CommandExecutor() {
    const [isOpen, setIsOpen] = useState(false)
    const [selectedIndex, setSelectedIndex] = useState(0)
    const [searchQuery, setSearchQuery] = useState('')
    const [commandGroups] = useState(groupCommands)
    const searchInputRef = useRef<HTMLInputElement>(null)

    // Flatten commands for keyboard navigation
    const allCommands = commandGroups.flatMap((g) => g.commands)

    // Filter commands based on search query
    const filteredGroups = React.useMemo(() => {
        if (!searchQuery.trim()) return commandGroups

        const filtered = commandGroups.map(group => ({
            ...group,
            commands: filterCommands(group.commands, searchQuery)
        })).filter(group => group.commands.length > 0)

        return filtered
    }, [commandGroups, searchQuery])

    // Flatten filtered commands for navigation
    const filteredCommands = filteredGroups.flatMap((g) => g.commands)

    // Toggle with Cmd+P
    useShortcut('command-executor', (e) => {
        e.preventDefault()
        setIsOpen((prev) => !prev)
    })

    // Reset and focus when opening
    useEffect(() => {
        if (isOpen) {
            setSearchQuery('')
            setSelectedIndex(0)
            // Auto-focus search input
            setTimeout(() => {
                searchInputRef.current?.focus()
            }, 0)
        }
    }, [isOpen])

    // Keyboard navigation
    useEffect(() => {
        if (!isOpen) return

        function handleKeyDown(e: KeyboardEvent) {
            // Ignore if we're typing in the search input and it's not a navigation key
            const isTypingInSearch = document.activeElement === searchInputRef.current
            const isNavigationKey = ['Escape', 'ArrowDown', 'ArrowUp', 'Enter', '/'].includes(e.key)

            if (isTypingInSearch && !isNavigationKey) return

            if (e.key === 'Escape') {
                e.preventDefault()
                setIsOpen(false)
            } else if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSelectedIndex((prev) => {
                    const nextIndex = prev + 1
                    return nextIndex >= filteredCommands.length ? 0 : nextIndex
                })
            } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSelectedIndex((prev) => {
                    const prevIndex = prev - 1
                    return prevIndex < 0 ? filteredCommands.length - 1 : prevIndex
                })
            } else if (e.key === 'Enter') {
                e.preventDefault()
                executeCommand(filteredCommands[selectedIndex]?.id)
            } else if (e.key === '/') {
                // If not focused on search, focus it
                if (!isTypingInSearch) {
                    e.preventDefault()
                    searchInputRef.current?.focus()
                }
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isOpen, selectedIndex, filteredCommands])

    // Reset selected index when search results change
    useEffect(() => {
        setSelectedIndex(0)
    }, [searchQuery])

    const executeCommand = useCallback((commandId: ShortcutId | undefined) => {
        if (!commandId) return

        setIsOpen(false)

        // Trigger the shortcut by dispatching a keyboard event
        const def = shortcutDefinitions[commandId]
        if (!def || !def.keys[0]) return

        const combo = def.keys[0]
        const event = new KeyboardEvent('keydown', {
            key: combo[combo.length - 1], // Last item is the actual key
            ctrlKey: combo.includes('Ctrl'),
            metaKey: combo.includes('Meta'),
            altKey: combo.includes('Alt'),
            shiftKey: combo.includes('Shift'),
            bubbles: true,
        })

        window.dispatchEvent(event)
    }, [])

    if (!isOpen) return null

    let commandIndex = 0

    return (
        <div
            className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh]"
            role="dialog"
            aria-modal="true"
            aria-label="Command executor"
        >
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-background/80 backdrop-blur-sm"
                onClick={() => setIsOpen(false)}
                aria-hidden="true"
            />

            {/* Content */}
            <div className="relative w-full max-w-[640px] overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl animate-in fade-in zoom-in-95 duration-200 mx-4">
                {/* Search Header */}
                <div className="flex items-center gap-3 border-b px-4 py-3">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <input
                        ref={searchInputRef}
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Type to search commands..."
                        className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground text-sm"
                    />
                    <button
                        onClick={() => setIsOpen(false)}
                        className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    >
                        <X className="h-4 w-4" />
                        <span className="sr-only">Close</span>
                    </button>
                </div>

                {/* Command List */}
                <div className="max-h-[400px] overflow-y-auto p-2">
                    {filteredGroups.length === 0 ? (
                        <div className="px-4 py-8 text-center text-muted-foreground text-sm">
                            No commands found matching "{searchQuery}"
                        </div>
                    ) : (
                        filteredGroups.map((group, groupIdx) => (
                            <div key={group.title} className={groupIdx > 0 ? 'mt-4' : ''}>
                                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{group.title}</div>
                                <div className="space-y-0.5">
                                    {group.commands.map((command) => {
                                        const currentIndex = commandIndex++
                                        const isSelected = currentIndex === selectedIndex

                                        return (
                                            <button
                                                key={command.id}
                                                onClick={() => executeCommand(command.id)}
                                                onMouseEnter={() => setSelectedIndex(currentIndex)}
                                                className={`w-full flex items-center justify-between rounded-md px-2 py-2 text-sm transition-colors ${isSelected
                                                        ? 'bg-accent text-accent-foreground'
                                                        : 'hover:bg-accent/50 hover:text-accent-foreground'
                                                    }`}
                                            >
                                                <span>{command.description}</span>
                                                <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                                                    {command.keys}
                                                </kbd>
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Footer hint */}
                <div className="border-t px-4 py-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                        <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium">
                            ↑↓
                        </kbd>
                        Navigate
                        <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium">
                            Enter
                        </kbd>
                        Execute
                        <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium">
                            Esc
                        </kbd>
                        Close
                        <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium">
                            /
                        </kbd>
                        Focus search
                    </span>
                </div>
            </div>
        </div>
    )
}
