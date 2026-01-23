import { buildMentionCandidates, searchNoteMentions, type NoteMentionCandidate } from "../../features/editor/utils/note-mention-search";
import { describe, expect, it } from "vitest";

describe('note mention search utilities', () => {
	it('builds mention candidates from nested folders', () => {
		const items = [
			{
				id: 'folder-1',
				name: 'Projects',
				type: 'folder',
				createdAt: 0,
				updatedAt: 0,
				children: [
					{
						id: 'note-1',
						name: 'Roadmap',
						type: 'note',
						content: [],
						createdAt: 0,
						updatedAt: 2
					}
				]
			},
			{
				id: 'note-2',
				name: 'Inbox',
				type: 'note',
				content: [],
				createdAt: 0,
				updatedAt: 1
			}
		] as any

		const candidates = buildMentionCandidates(items)
		expect(candidates).toHaveLength(2)
		expect(candidates[0]).toMatchObject({ id: 'note-1', path: 'Projects / Roadmap' })
		expect(candidates[1]).toMatchObject({ id: 'note-2', path: undefined })
	})

	it('performs fuzzy search and sorts by score and recency', () => {
		const candidates: NoteMentionCandidate[] = [
			{ id: '1', title: 'Monthly Review', updatedAt: 2 },
			{ id: '2', title: 'Review Meeting Notes', updatedAt: 3 },
			{ id: '3', title: 'Finances', updatedAt: 5 }
		]

		const results = searchNoteMentions('rev', candidates, 5)
		expect(results.map((r) => r.id)).toEqual(['2', '1'])
		expect(results[0].titleHighlights.some((part) => part.matched)).toBe(true)
	})
})
