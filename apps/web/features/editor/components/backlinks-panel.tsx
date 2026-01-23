'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronRight, Link2, Unlink } from 'lucide-react'
import { useBacklinks } from '../../notes/hooks/use-backlinks'
import { useNoteSlug } from '../../notes/hooks/use-note-slug'
import { useNotesContext } from '../../notes/context/notes-context'
import { cn } from '@skriuw/shared'
import { Button, Collapsible, CollapsibleContent, CollapsibleTrigger, Badge } from '@skriuw/ui'
import { Link as LinkIcon } from 'lucide-react'
import { createLinkInBlocks } from '../../notes/utils/link-mention'
import { notify } from '@/lib/notify'
import { flattenNotes } from '../../notes/utils/flatten-notes'
import type { Note } from '../../notes/types'

type BacklinksPanelProps = {
    noteId: string
    noteName: string
    className?: string
}

export function BacklinksPanel({ noteId, noteName, className }: BacklinksPanelProps) {
    const router = useRouter()
    const { items, updateNote } = useNotesContext()
    const { getNoteUrl } = useNoteSlug(items)
    const { backlinks, unlinkedMentions, totalCount, isLoading } = useBacklinks(noteId, noteName)

    const [isBacklinksOpen, setIsBacklinksOpen] = useState(true)
    const [isUnlinkedOpen, setIsUnlinkedOpen] = useState(false)

    const handleNavigate = (targetNoteId: string) => {
        const url = getNoteUrl(targetNoteId)
        router.push(url)
    }

    const handleLinkMention = async (e: React.MouseEvent, mention: typeof unlinkedMentions[0]) => {
        e.stopPropagation() // Prevent navigation

        try {
            const allNotes = flattenNotes(items).filter((item): item is Note => item.type === 'note')
            const sourceNote = allNotes.find(n => n.id === mention.noteId)

            if (!sourceNote || !sourceNote.content) {
                notify("Could not find source note").error()
                return
            }

            const { success, newBlocks } = createLinkInBlocks(
                sourceNote.content,
                noteName, // The text to find (which matches current note name)
                noteId,   // The ID to link to (current note)
                noteName  // The name to link to
            )

            if (!success) {
                notify("Could not find mention in note content").error()
                return
            }

            await updateNote(sourceNote.id, newBlocks)
            notify("Note linked successfully").success()
        } catch (err) {
            console.error("Failed to link mention", err)
            notify("Failed to link mention").error()
        }
    }

    if (isLoading) {
        return (
            <div className={cn("p-4 animate-pulse", className)}>
                <div className="h-4 w-24 bg-muted/50 rounded mb-3" />
                <div className="h-3 w-full bg-muted/30 rounded" />
            </div>
        )
    }

    if (totalCount === 0) {
        return (
            <div className={cn("p-4 text-sm text-muted-foreground", className)}>
                <div className="flex items-center gap-2 mb-2">
                    <Link2 className="w-4 h-4" />
                    <span className="font-medium">Linked References</span>
                </div>
                <p className="text-xs opacity-70">No other notes link to this page yet.</p>
            </div>
        )
    }

    return (
        <div className={cn("space-y-4 p-4", className)}>
            {backlinks.length > 0 && (
                <Collapsible open={isBacklinksOpen} onOpenChange={setIsBacklinksOpen}>
                    <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="w-full justify-start -ml-2 h-7">
                            {isBacklinksOpen ? <ChevronDown className="w-4 h-4 mr-1" /> : <ChevronRight className="w-4 h-4 mr-1" />}
                            <Link2 className="w-3.5 h-3.5 mr-1.5" />
                            <span className="text-xs font-medium">Linked References</span>
                            <Badge variant="secondary" className="ml-auto text-xs h-5 px-1.5 bg-muted/50">
                                {backlinks.length}
                            </Badge>
                        </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-2 space-y-2">
                        {backlinks.map((backlink, index) => (
                            <button
                                key={`${backlink.noteId}-${index}`}
                                onClick={() => handleNavigate(backlink.noteId)}
                                className="w-full text-left p-2 rounded-md hover:bg-muted/50 transition-colors group"
                            >
                                <div className="text-xs font-medium text-foreground group-hover:text-primary transition-colors">
                                    {backlink.noteName}
                                </div>
                                {backlink.context && (
                                    <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                        {backlink.context}
                                    </div>
                                )}
                            </button>
                        ))}
                    </CollapsibleContent>
                </Collapsible>
            )}

            {unlinkedMentions.length > 0 && (
                <Collapsible open={isUnlinkedOpen} onOpenChange={setIsUnlinkedOpen}>
                    <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="w-full justify-start -ml-2 h-7">
                            {isUnlinkedOpen ? <ChevronDown className="w-4 h-4 mr-1" /> : <ChevronRight className="w-4 h-4 mr-1" />}
                            <Unlink className="w-3.5 h-3.5 mr-1.5" />
                            <span className="text-xs font-medium">Unlinked Mentions</span>
                            <Badge variant="secondary" className="ml-auto text-xs h-5 px-1.5 bg-muted/50">
                                {unlinkedMentions.length}
                            </Badge>
                        </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-2 space-y-2">
                        {unlinkedMentions.map((mention, index) => (
                            <div
                                key={`${mention.noteId}-${index}`}
                                className="group/item relative"
                            >
                                <button
                                    onClick={() => handleNavigate(mention.noteId)}
                                    className="w-full text-left p-2 rounded-md hover:bg-muted/50 transition-colors group pr-8"
                                >
                                    <div className="text-xs font-medium text-foreground group-hover:text-primary transition-colors">
                                        {mention.noteName}
                                    </div>
                                    {mention.context && (
                                        <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                            {mention.context}
                                        </div>
                                    )}
                                </button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-1 top-1 h-6 w-6 opacity-0 group-hover/item:opacity-100 transition-opacity"
                                    onClick={(e) => handleLinkMention(e, mention)}
                                    title="Link this mention"
                                >
                                    <LinkIcon className="w-3 h-3" />
                                </Button>
                            </div>
                        ))}
                    </CollapsibleContent>
                </Collapsible>
            )}
        </div>
    )
}
