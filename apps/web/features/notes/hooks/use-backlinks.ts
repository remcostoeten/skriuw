import { useMemo } from 'react'
import { useNotesContext } from '../context/notes-context'
import { getBacklinks, getUnlinkedMentions, type Backlink } from '../utils/backlinks'

type UseBacklinksResult = {
    backlinks: Backlink[]
    unlinkedMentions: Backlink[]
    totalCount: number
    isLoading: boolean
}

export function useBacklinks(noteId: string, noteName: string): UseBacklinksResult {
    const { items, isInitialLoading } = useNotesContext()

    const backlinks = useMemo(() => {
        if (!noteId || !noteName || !items.length) return []
        return getBacklinks(items, noteId, noteName)
    }, [items, noteId, noteName])

    const unlinkedMentions = useMemo(() => {
        if (!noteId || !noteName || !items.length) return []
        return getUnlinkedMentions(items, noteId, noteName)
    }, [items, noteId, noteName])

    return {
        backlinks,
        unlinkedMentions,
        totalCount: backlinks.length + unlinkedMentions.length,
        isLoading: isInitialLoading
    }
}
