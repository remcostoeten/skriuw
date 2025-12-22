import type { Item, Note } from '../types'

/**
 * Flattens all notes from the tree structure in order (depth-first)
 * Only returns notes, not folders
 */
export function flattenNotes(items: Item[]): Note[] {
	const notes: Note[] = []

	function traverse(itemList: Item[]) {
		for (const item of itemList) {
			if (item.type === 'note') {
				notes.push(item)
			} else if (item.type === 'folder') {
				// Recursively traverse folder children
				traverse(item.children)
			}
		}
	}

	traverse(items)
	return notes
}
