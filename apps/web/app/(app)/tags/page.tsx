'use client'

import { useNotesContext } from '@/features/notes/context/notes-context'
import { flattenNotes } from '@/features/notes/utils/flatten-notes'
import type { Note } from '@/features/notes/types'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { Hash, Search } from 'lucide-react'

type TagInfo = {
    name: string
    noteCount: number
    lastUsed: number
}

export default function TagsOverviewPage() {
    const router = useRouter()
    const { items, isInitialLoading } = useNotesContext()
    const [searchQuery, setSearchQuery] = useState('')

    const allTags = useMemo(() => {
        const tagMap = new Map<string, TagInfo>()

        const allNotes = flattenNotes(items).filter(
            (item): item is Note => item.type === 'note'
        )

        for (const note of allNotes) {
            const noteTimestamp = note.updatedAt || note.createdAt || 0

            if (note.tags) {
                for (const tag of note.tags) {
                    const key = tag.toLowerCase()
                    const existing = tagMap.get(key)
                    tagMap.set(key, {
                        name: tag,
                        noteCount: (existing?.noteCount || 0) + 1,
                        lastUsed: Math.max(existing?.lastUsed || 0, noteTimestamp)
                    })
                }
            }

            if (note.content && Array.isArray(note.content)) {
                scanBlocksForTags(note.content, tagMap, noteTimestamp)
            }
        }

        return Array.from(tagMap.values()).sort((a, b) => b.noteCount - a.noteCount)
    }, [items])

    const filteredTags = searchQuery
        ? allTags.filter((t) =>
            t.name.toLowerCase().includes(searchQuery.toLowerCase())
        )
        : allTags

    const formatDate = (timestamp: number) => {
        if (!timestamp) return ''
        const date = new Date(timestamp)
        const now = new Date()
        const diffDays = Math.floor(
            (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
        )
        if (diffDays < 1) return 'today'
        if (diffDays < 7) return `${diffDays}d ago`
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }

    return (
        <div className='max-w-2xl mx-auto px-4 py-8'>
            <div className='flex items-center gap-3 mb-6'>
                <div className='flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10'>
                    <Hash size={20} className='text-primary' />
                </div>
                <div>
                    <h1 className='text-xl font-semibold'>Tags</h1>
                    <p className='text-sm text-muted-foreground'>
                        {allTags.length} {allTags.length === 1 ? 'tag' : 'tags'} across your notes
                    </p>
                </div>
            </div>

            {allTags.length > 5 && (
                <div className='relative mb-4'>
                    <Search
                        size={14}
                        className='absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground'
                    />
                    <input
                        type='text'
                        placeholder='Search tags...'
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className='w-full pl-8 pr-3 py-2 text-sm bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/50'
                    />
                </div>
            )}

            {isInitialLoading ? (
                <div className='text-sm text-muted-foreground py-8 text-center'>Loading...</div>
            ) : filteredTags.length === 0 ? (
                <div className='text-sm text-muted-foreground py-8 text-center'>
                    {searchQuery ? 'No matching tags' : 'No tags yet — use # in your notes to create tags'}
                </div>
            ) : (
                <div className='space-y-1'>
                    {filteredTags.map((tag) => (
                        <button
                            key={tag.name}
                            onClick={() =>
                                router.push(`/tags/${encodeURIComponent(tag.name)}`)
                            }
                            className='w-full text-left px-3 py-3 rounded-lg hover:bg-muted/50 transition-colors group flex items-center gap-3'
                        >
                            <Hash
                                size={14}
                                className='text-primary shrink-0'
                            />
                            <span className='font-medium text-sm group-hover:text-primary transition-colors'>
                                {tag.name}
                            </span>
                            <span className='text-xs text-muted-foreground ml-auto flex items-center gap-3'>
                                <span>{tag.noteCount} {tag.noteCount === 1 ? 'note' : 'notes'}</span>
                                <span>{formatDate(tag.lastUsed)}</span>
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}

function scanBlocksForTags(
    blocks: any[],
    tagMap: Map<string, TagInfo>,
    noteTimestamp: number
) {
    for (const block of blocks) {
        if (block.content && Array.isArray(block.content)) {
            for (const inline of block.content) {
                if (inline.type === 'tag' && inline.props?.tagName) {
                    const name = inline.props.tagName.trim()
                    if (!name) continue
                    const key = name.toLowerCase()
                    const existing = tagMap.get(key)
                    tagMap.set(key, {
                        name,
                        noteCount: (existing?.noteCount || 0) + 1,
                        lastUsed: Math.max(existing?.lastUsed || 0, noteTimestamp)
                    })
                }
            }
        }
        if (block.children?.length) {
            scanBlocksForTags(block.children, tagMap, noteTimestamp)
        }
    }
}
