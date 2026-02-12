import {
	parseWikilinks,
	extractWikilinksFromBlocks
} from '../../features/notes/utils/wikilink-parser'
import { describe, expect, it } from 'vitest'

describe('wikilink parser', () => {
	it('parses simple wikilinks', () => {
		const text = 'Check out [[Project Alpha]] and [[Beta]]'
		const links = parseWikilinks(text)

		expect(links).toHaveLength(2)
		expect(links[0]).toEqual({
			fullMatch: '[[Project Alpha]]',
			noteName: 'Project Alpha',
			startIndex: 10,
			endIndex: 27
		})
		expect(links[1]).toEqual({
			fullMatch: '[[Beta]]',
			noteName: 'Beta',
			startIndex: 32,
			endIndex: 40
		})
	})

	it('ignores partial brackets', () => {
		const text = 'This is [not a link] but [[this is]]'
		const links = parseWikilinks(text)
		expect(links).toHaveLength(1)
		expect(links[0].noteName).toBe('this is')
	})

	it('parses from block structure', () => {
		const blocks = [
			{
				type: 'paragraph',
				content: [{ type: 'text', text: 'Hello [[World]]' }]
			},
			{
				type: 'bulletListItem',
				content: [{ type: 'text', text: 'See [[Another Note]]' }]
			}
		]

		const links = extractWikilinksFromBlocks(blocks)
		expect(links).toHaveLength(2)
		expect(links[0].noteName).toBe('World')
		expect(links[1].noteName).toBe('Another Note')
	})

	it('parses from child blocks', () => {
		const blocks = [
			{
				type: 'paragraph',
				content: [],
				children: [
					{
						type: 'paragraph',
						content: [{ type: 'text', text: 'Nested [[Link]]' }]
					}
				]
			}
		]

		const links = extractWikilinksFromBlocks(blocks)
		expect(links).toHaveLength(1)
		expect(links[0].noteName).toBe('Link')
	})

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

	it('detects structured wikilink nodes without noteId', () => {
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

	it('detects both text-based and structured wikilinks in same block', () => {
		const blocks = [
			{
				type: 'paragraph',
				content: [
					{ type: 'text', text: 'See [[Text Link]] and ' },
					{
						type: 'wikilink',
						props: { noteName: 'Structured Link', noteId: 'id-456' }
					}
				]
			}
		]

		const links = extractWikilinksFromBlocks(blocks)
		expect(links).toHaveLength(2)
		expect(links[0].noteName).toBe('Text Link')
		expect(links[1].noteName).toBe('Structured Link')
		expect(links[1].noteId).toBe('id-456')
	})
})
