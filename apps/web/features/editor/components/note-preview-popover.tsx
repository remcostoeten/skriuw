'use client'

import { useNotesContext } from '@/features/notes/context/notes-context'
import type { Note } from '@/features/notes/types'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@skriuw/ui'
import type { ReactNode } from 'react'

function extractPreviewText(content: any[], maxLength = 150): string {
    const parts: string[] = []

    function traverse(blocks: any[]) {
        for (const block of blocks) {
            if (parts.join(' ').length >= maxLength) return
            if (block.content && Array.isArray(block.content)) {
                for (const inline of block.content) {
                    if (inline.type === 'text' && inline.text) {
                        parts.push(inline.text)
                    }
                    if (inline.type === 'wikilink' && inline.props?.noteName) {
                        parts.push(`[[${inline.props.noteName}]]`)
                    }
                }
            }
            if (block.children?.length) {
                traverse(block.children)
            }
        }
    }

    traverse(content)
    const full = parts.join(' ')
    return full.length > maxLength ? full.slice(0, maxLength) + '…' : full
}

type NotePreviewPopoverProps = {
    noteId: string
    noteName: string
    children: ReactNode
}

export function NotePreviewPopover({ noteId, noteName, children }: NotePreviewPopoverProps) {
    const { items } = useNotesContext()

    const findNote = (): Note | undefined => {
        const search = (list: any[]): Note | undefined => {
            for (const item of list) {
                if (item.type === 'note') {
                    if (item.id === noteId) return item
                    if (item.name?.toLowerCase() === noteName.toLowerCase()) return item
                }
                if (item.type === 'folder' && item.children) {
                    const found = search(item.children)
                    if (found) return found
                }
            }
            return undefined
        }
        return search(items)
    }

    const note = findNote()

    return (
        <HoverCard openDelay={400} closeDelay={100}>
            <HoverCardTrigger asChild>{children}</HoverCardTrigger>
            <HoverCardContent
                side='top'
                align='start'
                className='w-72 p-3'
                onClick={(e) => e.stopPropagation()}
            >
                {note ? (
                    <div className='space-y-2'>
                        <div className='flex items-center gap-1.5'>
                            {note.icon && <span className='text-sm'>{note.icon}</span>}
                            <span className='font-medium text-sm truncate'>{note.name}</span>
                        </div>
                        {note.content && Array.isArray(note.content) && note.content.length > 0 && (
                            <p className='text-xs text-muted-foreground leading-relaxed'>
                                {extractPreviewText(note.content)}
                            </p>
                        )}
                        {note.tags && note.tags.length > 0 && (
                            <div className='flex flex-wrap gap-1'>
                                {note.tags.slice(0, 5).map((tag) => (
                                    <span
                                        key={tag}
                                        className='text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary'
                                    >
                                        #{tag}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className='text-xs text-muted-foreground'>
                        <span className='font-medium'>{noteName}</span>
                        <span className='block mt-1 opacity-60'>Note not found — will be created on click</span>
                    </div>
                )}
            </HoverCardContent>
        </HoverCard>
    )
}
