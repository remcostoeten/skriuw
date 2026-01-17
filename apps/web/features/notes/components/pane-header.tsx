'use client'

import { useMemo, useCallback, useState } from 'react'
import { ChevronDown, X, FileText } from 'lucide-react'

import { cn, PaneHeaderProps } from '@skriuw/shared'
import { Button } from '@skriuw/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from '@skriuw/ui/dropdown-menu'

import { useNotesContext } from '@/features/notes/context/notes-context'
import { flattenNotes } from '@/features/notes/utils/flatten-notes'

export function PaneHeader({
    paneId,
    noteId,
    isActive,
    isPrimary,
    onNoteSelect,
    onClose,
}: PaneHeaderProps) {
    const { items } = useNotesContext()
    const [isOpen, setIsOpen] = useState(false)

    const notes = useMemo(() => flattenNotes(items), [items])

    const currentNote = useMemo(
        () => notes.find((note) => note.id === noteId),
        [notes, noteId]
    )

    const handleNoteSelect = useCallback(
        (selectedNoteId: string) => {
            onNoteSelect(paneId, selectedNoteId)
            setIsOpen(false)
        },
        [paneId, onNoteSelect]
    )

    return (
        <div
            className={cn(
                'flex items-center justify-between gap-2 px-2 py-1 border-b transition-colors shrink-0',
                isActive
                    ? 'bg-primary/5 border-primary/20'
                    : 'bg-muted/30 border-border/50'
            )}
        >
            {/* Active indicator bar */}
            {isActive && (
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary" />
            )}

            <div className="flex items-center gap-2 flex-1 min-w-0">
                <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            className={cn(
                                'h-6 px-2 gap-1.5 text-xs font-medium max-w-[200px]',
                                isActive ? 'text-foreground' : 'text-muted-foreground'
                            )}
                        >
                            <FileText className="w-3 h-3 shrink-0" />
                            <span className="truncate">
                                {currentNote?.name || 'Select a note'}
                            </span>
                            <ChevronDown className="w-3 h-3 shrink-0 opacity-50" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        align="start"
                        className="max-h-[300px] overflow-y-auto w-[250px]"
                    >
                        {notes.length === 0 ? (
                            <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                                No notes available
                            </DropdownMenuItem>
                        ) : (
                            <>
                                {noteId && (
                                    <>
                                        <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                                            Current: {currentNote?.name}
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                    </>
                                )}
                                {notes
                                    .filter((note) => note.id !== noteId)
                                    .slice(0, 20)
                                    .map((note) => (
                                        <DropdownMenuItem
                                            key={note.id}
                                            onClick={() => handleNoteSelect(note.id)}
                                            className="text-xs"
                                        >
                                            <FileText className="w-3 h-3 mr-2 shrink-0" />
                                            <span className="truncate">{note.name}</span>
                                        </DropdownMenuItem>
                                    ))}
                                {notes.filter((note) => note.id !== noteId).length > 20 && (
                                    <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                                        +{notes.filter((note) => note.id !== noteId).length - 20} more notes...
                                    </DropdownMenuItem>
                                )}
                            </>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>

                {isActive && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                        Active
                    </span>
                )}
            </div>

            {!isPrimary && onClose && (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClose}
                    className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
                    title="Close pane"
                >
                    <X className="w-3 h-3" />
                </Button>
            )}
        </div>
    )
}
