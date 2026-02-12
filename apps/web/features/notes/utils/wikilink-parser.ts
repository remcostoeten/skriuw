import type { Item, Note } from '../types'
import { flattenNotes } from './flatten-notes'

export type WikilinkMatch = {
	fullMatch: string
	noteName: string
	noteId?: string
}

export function extractWikilinksFromBlocks(blocks: any[]): WikilinkMatch[] {
	const allMatches: WikilinkMatch[] = []

	function traverseBlocks(blockList: any[]) {
		for (const block of blockList) {
			if (block.content && Array.isArray(block.content)) {
				for (const inline of block.content) {
					if (inline.type === 'wikilink' && inline.props?.noteName) {
						allMatches.push({
							fullMatch: `[[${inline.props.noteName}]]`,
							noteName: inline.props.noteName,
							noteId: inline.props.noteId || ''
						})
					}
				}
			}

			if (block.children && Array.isArray(block.children)) {
				traverseBlocks(block.children)
			}
		}
	}

	traverseBlocks(blocks)
	return allMatches
}

export function findNoteByName(items: Item[], name: string): Note | null {
	const allNotes = flattenNotes(items).filter((item): item is Note => item.type === 'note')
	const lowerName = name.toLowerCase()

	const exactMatch = allNotes.find((note) => note.name.toLowerCase() === lowerName)
	if (exactMatch) return exactMatch

	const startsWithMatch = allNotes.find((note) => note.name.toLowerCase().startsWith(lowerName))
	return startsWithMatch || null
}

export function getNoteNamesForAutocomplete(items: Item[], query: string): string[] {
	const allNotes = flattenNotes(items).filter((item): item is Note => item.type === 'note')
	const lowerQuery = query.toLowerCase()

	return allNotes
		.filter((note) => note.name.toLowerCase().includes(lowerQuery))
		.sort((a, b) => {
			const aStartsWith = a.name.toLowerCase().startsWith(lowerQuery)
			const bStartsWith = b.name.toLowerCase().startsWith(lowerQuery)
			if (aStartsWith && !bStartsWith) return -1
			if (!aStartsWith && bStartsWith) return 1
			return a.name.localeCompare(b.name)
		})
		.slice(0, 10)
		.map((note) => note.name)
}

export function createWikilinkText(noteName: string): string {
	return `[[${noteName}]]`
}
