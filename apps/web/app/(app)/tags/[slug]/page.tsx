'use client'

import { useParams, useRouter } from 'next/navigation'
import { useNotesByTag } from '@/features/tags/hooks/use-notes-by-tag'
import { useNoteSlug } from '@/features/notes/hooks/use-note-slug'
import { useNotesContext } from '@/features/notes/context/notes-context'
import { ArrowLeft, FileText, Hash } from 'lucide-react'
import { useState } from 'react'

export default function TagDetailPage() {
    const params = useParams()
    const router = useRouter()
    const tagName = decodeURIComponent(params.slug as string)
    const { notes, isLoading } = useNotesByTag(tagName)
    const { items } = useNotesContext()
    const { getNoteUrl } = useNoteSlug(items)
    const [searchQuery, setSearchQuery] = useState('')

    const filteredNotes = searchQuery
        ? notes.filter((n) =>
            n.note.name.toLowerCase().includes(searchQuery.toLowerCase())
        )
        : notes

    const formatDate = (timestamp: number | undefined) => {
        if (!timestamp) return ''
        const date = new Date(timestamp)
        const now = new Date()
        const diffMs = now.getTime() - date.getTime()
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

        if (diffHours < 1) return 'just now'
        if (diffHours < 24) return `${diffHours}h ago`
        if (diffDays < 7) return `${diffDays}d ago`
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }

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
                    <Hash size={20} className='text-primary' />
                </div>
                <div>
                    <h1 className='text-xl font-semibold'>{tagName}</h1>
                    <p className='text-sm text-muted-foreground'>
                        {notes.length} {notes.length === 1 ? 'note' : 'notes'}
                    </p>
                </div>
            </div>

            {notes.length > 3 && (
                <input
                    type='text'
                    placeholder='Filter notes...'
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className='w-full mb-4 px-3 py-2 text-sm bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/50'
                />
            )}

            {isLoading ? (
                <div className='text-sm text-muted-foreground py-8 text-center'>Loading...</div>
            ) : filteredNotes.length === 0 ? (
                <div className='text-sm text-muted-foreground py-8 text-center'>
                    {searchQuery ? 'No matching notes' : 'No notes with this tag'}
                </div>
            ) : (
                <div className='space-y-1'>
                    {filteredNotes.map(({ note, contextPreview }) => (
                        <button
                            key={note.id}
                            onClick={() => router.push(getNoteUrl(note.id))}
                            className='w-full text-left px-3 py-3 rounded-lg hover:bg-muted/50 transition-colors group'
                        >
                            <div className='flex items-center gap-2 mb-1'>
                                {note.icon ? (
                                    <span className='text-sm'>{note.icon}</span>
                                ) : (
                                    <FileText size={14} className='text-muted-foreground' />
                                )}
                                <span className='font-medium text-sm group-hover:text-primary transition-colors'>
                                    {note.name}
                                </span>
                                <span className='text-xs text-muted-foreground ml-auto'>
                                    {formatDate(note.updatedAt)}
                                </span>
                            </div>
                            {contextPreview && (
                                <p className='text-xs text-muted-foreground pl-6 line-clamp-2'>
                                    {contextPreview}
                                </p>
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}
