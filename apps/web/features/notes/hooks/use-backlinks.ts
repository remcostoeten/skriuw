import { useMemo } from 'react'
import { useNotesContext } from '../context/notes-context'
import { getBacklinks, getUnlinkedMentions, type Backlink } from '../utils/backlinks'
import { flattenNotes } from '../utils/flatten-notes'
import type { Block } from '@blocknote/core'
import type { Item, Note } from '../types'

type UseBacklinksResult = {
	backlinks: Backlink[]
	unlinkedMentions: Backlink[]
	totalCount: number
	isLoading: boolean
}

function overlayEditorBlocks(items: Item[], noteId: string, editorBlocks: Block[]): Item[] {
	return items.map((item) => {
		if (item.type === 'note' && item.id === noteId) {
			return { ...item, content: editorBlocks } as Note
		}
		if (item.type === 'folder' && item.children) {
			return { ...item, children: overlayEditorBlocks(item.children, noteId, editorBlocks) }
		}
		return item
	})
}

export function useBacklinks(
	noteId: string,
	noteName: string,
	currentEditorBlocks?: Block[]
): UseBacklinksResult {
	const { items, isInitialLoading } = useNotesContext()

	const effectiveItems = useMemo(() => {
		if (!currentEditorBlocks || !noteId) return items
		return overlayEditorBlocks(items, noteId, currentEditorBlocks)
	}, [items, noteId, currentEditorBlocks])

	const backlinks = useMemo(() => {
		if (!noteId || !noteName || !effectiveItems.length) return []
		return getBacklinks(effectiveItems, noteId, noteName)
	}, [effectiveItems, noteId, noteName])

	const unlinkedMentions = useMemo(() => {
		if (!noteId || !noteName || !effectiveItems.length) return []
		return getUnlinkedMentions(effectiveItems, noteId, noteName)
	}, [effectiveItems, noteId, noteName])

	return {
		backlinks,
		unlinkedMentions,
		totalCount: backlinks.length + unlinkedMentions.length,
		isLoading: isInitialLoading
	}
}
