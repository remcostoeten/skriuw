import { extractWikilinksFromBlocks } from '../../features/notes/utils/wikilink-parser'
import { describe, expect, it } from 'vitest'

describe('wikilink parser', () => {
	it('detects structured wikilink inline content nodes', () => {
		const blocks = [
			{
				type: 'paragraph',
				content: [
					{ type: 'text', text: 'See ' },
					{
						type: 'wikilink',
						props: {
							noteName: 'Project Alpha',
							noteId: 'note-123'
						}
					},
					{ type: 'text', text: ' for details' }
				]
			}
		]

		const links = extractWikilinksFromBlocks(blocks)
		expect(links).toHaveLength(1)
		expect(links[0].noteName).toBe('Project Alpha')
		expect(links[0].noteId).toBe('note-123')
		expect(links[0].fullMatch).toBe('[[Project Alpha]]')
	})

	it('detects wikilink nodes without noteId', () => {
		const blocks = [
			{
				type: 'paragraph',
				content: [
					{
						type: 'wikilink',
						props: { noteName: 'New Note' }
					}
				]
			}
		]

		const links = extractWikilinksFromBlocks(blocks)
		expect(links).toHaveLength(1)
		expect(links[0].noteName).toBe('New Note')
		expect(links[0].noteId).toBe('')
	})

	it('detects wikilinks in nested child blocks', () => {
		const blocks = [
			{
				type: 'paragraph',
				content: [],
				children: [
					{
						type: 'paragraph',
						content: [
							{
								type: 'wikilink',
								props: { noteName: 'Nested Link', noteId: 'id-789' }
							}
						]
					}
				]
			}
		]

		const links = extractWikilinksFromBlocks(blocks)
		expect(links).toHaveLength(1)
		expect(links[0].noteName).toBe('Nested Link')
	})

	it('detects multiple wikilinks across blocks', () => {
		const blocks = [
			{
				type: 'paragraph',
				content: [
					{
						type: 'wikilink',
						props: { noteName: 'First', noteId: 'id-1' }
					}
				]
			},
			{
				type: 'bulletListItem',
				content: [
					{ type: 'text', text: 'Item with ' },
					{
						type: 'wikilink',
						props: { noteName: 'Second', noteId: 'id-2' }
					}
				]
			}
		]

		const links = extractWikilinksFromBlocks(blocks)
		expect(links).toHaveLength(2)
		expect(links[0].noteName).toBe('First')
		expect(links[1].noteName).toBe('Second')
	})

	it('ignores plain text nodes', () => {
		const blocks = [
			{
				type: 'paragraph',
				content: [
					{ type: 'text', text: 'Just some [[plain text]] here' }
				]
			}
		]

		const links = extractWikilinksFromBlocks(blocks)
		expect(links).toHaveLength(0)
	})
})
