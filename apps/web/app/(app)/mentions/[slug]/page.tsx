'use client'

import { useParams, useRouter } from 'next/navigation'
import { useBacklinks } from '@/features/notes/hooks/use-backlinks'
import { useNotesContext } from '@/features/notes/context/notes-context'
import { useNoteSlug } from '@/features/notes/hooks/use-note-slug'
import { flattenNotes } from '@/features/notes/utils/flatten-notes'
import type { Note } from '@/features/notes/types'
import { ArrowLeft, FileText, Link2 } from 'lucide-react'
import { useMemo, useState } from 'react'

export default function MentionDetailPage() {
    const params = useParams()
    const router = useRouter()
    const noteSlug = decodeURIComponent(params.slug as string)
    const { items } = useNotesContext()
    const { getNoteUrl } = useNoteSlug(items)
    const [searchQuery, setSearchQuery] = useState('')

    const targetNote = useMemo(() => {
        const allNotes = flattenNotes(items).filter(
            (item): item is Note => item.type === 'note'
        )
        return allNotes.find(
            (n) => n.name.toLowerCase() === noteSlug.toLowerCase() || n.id === noteSlug
        )
    }, [items, noteSlug])

    const noteName = targetNote?.name || noteSlug
    const noteId = targetNote?.id || ''

    const { backlinks, unlinkedMentions, totalCount, isLoading } = useBacklinks(noteId, noteName)

    const filteredBacklinks = searchQuery
        ? backlinks.filter((b) =>
            b.noteName.toLowerCase().includes(searchQuery.toLowerCase())
        )
        : backlinks

    const filteredUnlinked = searchQuery
        ? unlinkedMentions.filter((b) =>
            b.noteName.toLowerCase().includes(searchQuery.toLowerCase())
        )
        : unlinkedMentions

    return (
        <div className='max-w-2xl mx-auto px-4 py-8'>
            <button
                onClick={() => router.back()}
                className='flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors'
            >
                <ArrowLeft size={14} />
                Back
            </button>

            <div className='flex items-center gap-3 mb-6'>
                <div className='flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10'>
                    <Link2 size={20} className='text-primary' />
                </div>
                <div>
                    <h1 className='text-xl font-semibold'>
                        {targetNote?.icon && <span className='mr-1'>{targetNote.icon}</span>}
                        {noteName}
                    </h1>
                    <p className='text-sm text-muted-foreground'>
                        {totalCount} {totalCount === 1 ? 'reference' : 'references'}
                    </p>
                </div>
            </div>

            {totalCount > 3 && (
                <input
                    type='text'
                    placeholder='Filter references...'
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className='w-full mb-4 px-3 py-2 text-sm bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/50'
                />
            )}

            {isLoading ? (
                <div className='text-sm text-muted-foreground py-8 text-center'>Loading...</div>
            ) : (
                <>
                    {filteredBacklinks.length > 0 && (
                        <div className='mb-6'>
                            <h2 className='text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1'>
                                Linked References ({filteredBacklinks.length})
                            </h2>
                            <div className='space-y-1'>
                                {filteredBacklinks.map((backlink) => (
                                    <button
                                        key={`${backlink.noteId}-${backlink.linkText}`}
                                        onClick={() => router.push(getNoteUrl(backlink.noteId))}
                                        className='w-full text-left px-3 py-3 rounded-lg hover:bg-muted/50 transition-colors group'
                                    >
                                        <div className='flex items-center gap-2 mb-1'>
                                            <FileText
                                                size={14}
                                                className='text-muted-foreground shrink-0'
                                            />
                                            <span className='font-medium text-sm group-hover:text-primary transition-colors'>
                                                {backlink.noteName}
                                            </span>
                                        </div>
                                        {backlink.context && (
                                            <p className='text-xs text-muted-foreground pl-6 line-clamp-2'>
                                                {backlink.context}
                                            </p>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {filteredUnlinked.length > 0 && (
                        <div>
                            <h2 className='text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1'>
                                Unlinked Mentions ({filteredUnlinked.length})
                            </h2>
                            <div className='space-y-1'>
                                {filteredUnlinked.map((mention) => (
                                    <button
                                        key={`${mention.noteId}-unlinked`}
                                        onClick={() => router.push(getNoteUrl(mention.noteId))}
                                        className='w-full text-left px-3 py-3 rounded-lg hover:bg-muted/50 transition-colors group'
                                    >
                                        <div className='flex items-center gap-2 mb-1'>
                                            <FileText
                                                size={14}
                                                className='text-muted-foreground shrink-0'
                                            />
                                            <span className='font-medium text-sm group-hover:text-primary transition-colors'>
                                                {mention.noteName}
                                            </span>
                                        </div>
                                        {mention.context && (
                                            <p className='text-xs text-muted-foreground pl-6 line-clamp-2'>
                                                {mention.context}
                                            </p>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {filteredBacklinks.length === 0 && filteredUnlinked.length === 0 && (
                        <div className='text-sm text-muted-foreground py-8 text-center'>
                            {searchQuery ? 'No matching references' : 'No references to this note yet'}
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
