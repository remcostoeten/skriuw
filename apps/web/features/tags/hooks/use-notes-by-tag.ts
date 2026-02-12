import { useMemo } from 'react'
import { useNotesContext } from '@/features/notes/context/notes-context'
import { flattenNotes } from '@/features/notes/utils/flatten-notes'
import type { Note } from '@/features/notes/types'

type NoteWithContext = {
    note: Note
    contextPreview: string
}

function extractContextAroundTag(content: any[], tagName: string): string {
    const parts: string[] = []

    function traverse(blocks: any[]) {
        for (const block of blocks) {
            if (block.content && Array.isArray(block.content)) {
                for (const inline of block.content) {
                    if (inline.type === 'text' && inline.text) {
                        parts.push(inline.text)
                    }
                    if (inline.type === 'tag' && inline.props?.tagName) {
                        parts.push(`#${inline.props.tagName}`)
                    }
                    if (inline.type === 'wikilink' && inline.props?.noteName) {
                        parts.push(`[[${inline.props.noteName}]]`)
                    }
                }
            }
            if (block.children?.length) traverse(block.children)
        }
    }

    traverse(content)
    const fullText = parts.join(' ')
    const lowerTag = `#${tagName}`.toLowerCase()
    const index = fullText.toLowerCase().indexOf(lowerTag)

    if (index === -1) return fullText.slice(0, 120)

    const start = Math.max(0, index - 40)
    const end = Math.min(fullText.length, index + lowerTag.length + 40)
    let context = fullText.slice(start, end)

    if (start > 0) context = '...' + context
    if (end < fullText.length) context = context + '...'

    return context.trim()
}

function noteHasTag(note: Note, tagName: string): boolean {
    const lowerTag = tagName.toLowerCase()

    if (note.tags?.some((t) => t.toLowerCase() === lowerTag)) {
        return true
    }

    if (!note.content || !Array.isArray(note.content)) return false

    function scanBlocks(blocks: any[]): boolean {
        for (const block of blocks) {
            if (block.content && Array.isArray(block.content)) {
                for (const inline of block.content) {
                    if (
                        inline.type === 'tag' &&
                        inline.props?.tagName?.toLowerCase() === lowerTag
                    ) {
                        return true
                    }
                }
            }
            if (block.children?.length && scanBlocks(block.children)) return true
        }
        return false
    }

    return scanBlocks(note.content)
}

export function useNotesByTag(tagName: string): {
    notes: NoteWithContext[]
    isLoading: boolean
} {
    const { items, isInitialLoading } = useNotesContext()

    const notes = useMemo(() => {
        if (!tagName || !items.length) return []

        const allNotes = flattenNotes(items).filter(
            (item): item is Note => item.type === 'note'
        )

        return allNotes
            .filter((note) => noteHasTag(note, tagName))
            .map((note) => ({
                note,
                contextPreview: extractContextAroundTag(note.content || [], tagName)
            }))
            .sort((a, b) => (b.note.updatedAt || 0) - (a.note.updatedAt || 0))
    }, [items, tagName])

    return { notes, isLoading: isInitialLoading }
}
