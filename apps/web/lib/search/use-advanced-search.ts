'use client'

import { useMemo, useDeferredValue, useCallback, useState } from 'react'
import type { Note, Item, Folder } from '@/features/notes/types'
import {
	parseSearchQuery,
	globToRegex,
	type ParsedQuery,
	type SearchToken,
	type SearchOptions
} from './query-parser'

export type SearchResult = {
	item: Item
	score: number
	matches: SearchMatch[]
	path: string[]
}

export type SearchMatch = {
	field: 'name' | 'content' | 'tags'
	indices: Array<[number, number]>
	text: string
}

export type AdvancedSearchOptions = SearchOptions & {
	limit?: number
	searchContent?: boolean
}

/**
 * Advanced search hook with deferred updates for 60fps UI
 */
export function useAdvancedSearch(
	items: Item[],
	query: string,
	options: AdvancedSearchOptions = {}
) {
	const {
		caseSensitive = false,
		wholeWord = false,
		useRegex = false,
		limit = 50,
		searchContent = true
	} = options

	// Defer the query to prevent UI blocking
	const deferredQuery = useDeferredValue(query)

	// Parse the query
	const parsedQuery = useMemo(
		() => parseSearchQuery(deferredQuery, { caseSensitive, wholeWord, useRegex }),
		[deferredQuery, caseSensitive, wholeWord, useRegex]
	)

	// Flatten items for searching
	const flatItems = useMemo(() => flattenItems(items), [items])

	// Perform the search
	const results = useMemo(() => {
		if (!parsedQuery.tokens.length) {
			return []
		}

		const searchResults: SearchResult[] = []

		for (const { item, path } of flatItems) {
			const result = scoreItem(item, path, parsedQuery, { searchContent, wholeWord })
			if (result && result.score > 0) {
				searchResults.push(result)
			}
		}

		// Sort by score descending, then by recency
		searchResults.sort((a, b) => {
			if (b.score !== a.score) return b.score - a.score
			const aTime = a.item.updatedAt || a.item.createdAt || 0
			const bTime = b.item.updatedAt || b.item.createdAt || 0
			return bTime - aTime
		})

		return searchResults.slice(0, limit)
	}, [flatItems, parsedQuery, searchContent, wholeWord, limit])

	const isStale = query !== deferredQuery

	return {
		results,
		parsedQuery,
		isStale,
		isEmpty: !query.trim(),
		hasResults: results.length > 0
	}
}

/**
 * Flatten nested item structure with path tracking
 */
function flattenItems(
	items: Item[],
	path: string[] = []
): Array<{ item: Item; path: string[] }> {
	const result: Array<{ item: Item; path: string[] }> = []

	for (const item of items) {
		result.push({ item, path })

		if (item.type === 'folder' && item.children) {
			const folder = item as Folder
			result.push(...flattenItems(folder.children, [...path, folder.name]))
		}
	}

	return result
}

/**
 * Score an item against the parsed query
 */
function scoreItem(
	item: Item,
	path: string[],
	query: ParsedQuery,
	options: { searchContent: boolean; wholeWord: boolean }
): SearchResult | null {
	const { searchContent, wholeWord } = options
	const caseSensitive = query.options.caseSensitive

	let totalScore = 0
	const matches: SearchMatch[] = []
	let allTokensMatch = true

	for (const token of query.tokens) {
		const tokenResult = matchToken(item, path, token, { caseSensitive, wholeWord, searchContent })

		if (token.type !== 'text' || !('negated' in token) || !token.negated) {
			// Positive match required
			if (tokenResult.matches) {
				totalScore += tokenResult.score
				if (tokenResult.matchInfo) {
					matches.push(tokenResult.matchInfo)
				}
			} else {
				allTokensMatch = false
				break
			}
		} else {
			// Negated match - should NOT match
			if (tokenResult.matches) {
				allTokensMatch = false
				break
			}
		}
	}

	if (!allTokensMatch) {
		return null
	}

	// Bonus for pinned/favorite items
	if (item.pinned) totalScore += 5
	if (item.type === 'note' && (item as Note).favorite) totalScore += 3

	return {
		item,
		score: totalScore,
		matches,
		path
	}
}

/**
 * Match a single token against an item
 */
function matchToken(
	item: Item,
	path: string[],
	token: SearchToken,
	options: { caseSensitive: boolean; wholeWord: boolean; searchContent: boolean }
): { matches: boolean; score: number; matchInfo?: SearchMatch } {
	const { caseSensitive, wholeWord, searchContent } = options

	switch (token.type) {
		case 'text': {
			const result = matchText(item, token.value, { caseSensitive, wholeWord, searchContent })
			if (token.negated) {
				return { matches: !result.matches, score: 0 }
			}
			return result
		}

		case 'tag': {
			if (item.type !== 'note') return { matches: token.negated, score: 0 }
			const note = item as Note
			const tags = note.tags || []
			const hasTag = tags.some((t) =>
				caseSensitive
					? t === token.value
					: t.toLowerCase() === token.value.toLowerCase()
			)
			if (token.negated) {
				return { matches: !hasTag, score: 0 }
			}
			return { matches: hasTag, score: hasTag ? 15 : 0 }
		}

		case 'is': {
			let matches = false
			if (item.type === 'note') {
				const note = item as Note
				switch (token.value) {
					case 'public':
						matches = note.isPublic === true
						break
					case 'private':
						matches = note.isPublic !== true
						break
					case 'pinned':
						matches = item.pinned === true
						break
					case 'favorite':
						matches = note.favorite === true
						break
				}
			} else {
				if (token.value === 'pinned') {
					matches = item.pinned === true
				}
			}
			if (token.negated) {
				return { matches: !matches, score: 0 }
			}
			return { matches, score: matches ? 10 : 0 }
		}

		case 'folder': {
			const folderName = token.value.toLowerCase()
			const inFolder = path.some((p) => p.toLowerCase().includes(folderName))
			if (token.negated) {
				return { matches: !inFolder, score: 0 }
			}
			return { matches: inFolder, score: inFolder ? 12 : 0 }
		}

		case 'created':
		case 'updated': {
			const itemDate = token.type === 'created' ? item.createdAt : item.updatedAt
			if (!itemDate) return { matches: false, score: 0 }

			const itemTime = new Date(itemDate).getTime()
			const tokenTime = token.value.getTime()
			let matches = false

			switch (token.operator) {
				case '>':
					matches = itemTime > tokenTime
					break
				case '>=':
					matches = itemTime >= tokenTime
					break
				case '<':
					matches = itemTime < tokenTime
					break
				case '<=':
					matches = itemTime <= tokenTime
					break
				case '=':
					// Same day comparison
					const itemDay = new Date(itemDate).toDateString()
					const tokenDay = token.value.toDateString()
					matches = itemDay === tokenDay
					break
			}

			return { matches, score: matches ? 8 : 0 }
		}

		case 'regex': {
			const nameMatch = token.pattern.test(item.name)
			let contentMatch = false

			if (searchContent && item.type === 'note') {
				const note = item as Note
				const content = extractTextContent(note.content)
				contentMatch = token.pattern.test(content)
			}

			const matches = nameMatch || contentMatch
			return {
				matches,
				score: matches ? (nameMatch ? 20 : 10) : 0,
				matchInfo: matches
					? {
							field: nameMatch ? 'name' : 'content',
							indices: findRegexIndices(nameMatch ? item.name : '', token.pattern),
							text: item.name
						}
					: undefined
			}
		}

		case 'glob': {
			const pattern = globToRegex(token.value, caseSensitive)
			const matches = pattern.test(item.name)
			if (token.negated) {
				return { matches: !matches, score: 0 }
			}
			return { matches, score: matches ? 15 : 0 }
		}

		default:
			return { matches: false, score: 0 }
	}
}

/**
 * Match text against item name and content
 */
function matchText(
	item: Item,
	query: string,
	options: { caseSensitive: boolean; wholeWord: boolean; searchContent: boolean }
): { matches: boolean; score: number; matchInfo?: SearchMatch } {
	const { caseSensitive, wholeWord, searchContent } = options

	const normalizedQuery = caseSensitive ? query : query.toLowerCase()
	const normalizedName = caseSensitive ? item.name : item.name.toLowerCase()

	// Check name match
	const nameResult = fuzzyMatch(normalizedName, normalizedQuery, wholeWord)
	if (nameResult.matches) {
		return {
			matches: true,
			score: nameResult.score + 10, // Bonus for name match
			matchInfo: {
				field: 'name',
				indices: nameResult.indices,
				text: item.name
			}
		}
	}

	// Check content match for notes
	if (searchContent && item.type === 'note') {
		const note = item as Note
		const content = extractTextContent(note.content)
		const normalizedContent = caseSensitive ? content : content.toLowerCase()
		const contentResult = fuzzyMatch(normalizedContent, normalizedQuery, wholeWord)

		if (contentResult.matches) {
			return {
				matches: true,
				score: contentResult.score,
				matchInfo: {
					field: 'content',
					indices: contentResult.indices,
					text: content.slice(0, 200) // Preview
				}
			}
		}
	}

	// Check tags
	if (item.type === 'note') {
		const note = item as Note
		const tags = note.tags || []
		for (const tag of tags) {
			const normalizedTag = caseSensitive ? tag : tag.toLowerCase()
			if (normalizedTag.includes(normalizedQuery)) {
				return {
					matches: true,
					score: 8,
					matchInfo: {
						field: 'tags',
						indices: [[normalizedTag.indexOf(normalizedQuery), normalizedTag.indexOf(normalizedQuery) + normalizedQuery.length]],
						text: tag
					}
				}
			}
		}
	}

	return { matches: false, score: 0 }
}

/**
 * Fuzzy matching with scoring
 */
function fuzzyMatch(
	text: string,
	query: string,
	wholeWord: boolean
): { matches: boolean; score: number; indices: Array<[number, number]> } {
	if (!query) return { matches: true, score: 0, indices: [] }

	if (wholeWord) {
		const regex = new RegExp(`\\b${escapeRegex(query)}\\b`, 'gi')
		const match = regex.exec(text)
		if (match) {
			return {
				matches: true,
				score: query.length * 5 + 10,
				indices: [[match.index, match.index + match[0].length]]
			}
		}
		return { matches: false, score: 0, indices: [] }
	}

	// Exact substring match (highest priority)
	const exactIndex = text.indexOf(query)
	if (exactIndex !== -1) {
		const startBonus = exactIndex === 0 ? 10 : 0
		return {
			matches: true,
			score: query.length * 5 + startBonus + 15,
			indices: [[exactIndex, exactIndex + query.length]]
		}
	}

	// Fuzzy character-by-character match
	let textIdx = 0
	let queryIdx = 0
	let consecutiveBonus = 0
	let lastMatchIdx = -2
	const indices: Array<[number, number]> = []
	let currentMatchStart = -1

	while (textIdx < text.length && queryIdx < query.length) {
		if (text[textIdx] === query[queryIdx]) {
			if (lastMatchIdx === textIdx - 1) {
				consecutiveBonus += 2
			} else {
				if (currentMatchStart !== -1) {
					indices.push([currentMatchStart, lastMatchIdx + 1])
				}
				currentMatchStart = textIdx
			}
			lastMatchIdx = textIdx
			queryIdx++
		}
		textIdx++
	}

	if (queryIdx === query.length) {
		if (currentMatchStart !== -1) {
			indices.push([currentMatchStart, lastMatchIdx + 1])
		}
		const startBonus = indices[0]?.[0] === 0 ? 5 : 0
		return {
			matches: true,
			score: query.length * 3 + consecutiveBonus + startBonus,
			indices
		}
	}

	return { matches: false, score: 0, indices: [] }
}

/**
 * Extract text content from BlockNote blocks
 */
function extractTextContent(content: any[] | undefined): string {
	if (!content || !Array.isArray(content)) return ''

	const texts: string[] = []

	function extractFromBlock(block: any) {
		if (block.content && Array.isArray(block.content)) {
			for (const item of block.content) {
				if (item.type === 'text' && item.text) {
					texts.push(item.text)
				}
			}
		}
		if (block.children && Array.isArray(block.children)) {
			for (const child of block.children) {
				extractFromBlock(child)
			}
		}
	}

	for (const block of content) {
		extractFromBlock(block)
	}

	return texts.join(' ')
}

/**
 * Find all regex match indices
 */
function findRegexIndices(text: string, pattern: RegExp): Array<[number, number]> {
	const indices: Array<[number, number]> = []
	const globalPattern = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g')

	let match
	while ((match = globalPattern.exec(text)) !== null) {
		indices.push([match.index, match.index + match[0].length])
		if (!pattern.flags.includes('g')) break
	}

	return indices
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Build highlight parts for rendering
 */
export function buildHighlightParts(
	text: string,
	indices: Array<[number, number]>
): Array<{ text: string; highlighted: boolean }> {
	if (!indices.length) {
		return [{ text, highlighted: false }]
	}

	const parts: Array<{ text: string; highlighted: boolean }> = []
	let lastEnd = 0

	for (const [start, end] of indices) {
		if (start > lastEnd) {
			parts.push({ text: text.slice(lastEnd, start), highlighted: false })
		}
		parts.push({ text: text.slice(start, end), highlighted: true })
		lastEnd = end
	}

	if (lastEnd < text.length) {
		parts.push({ text: text.slice(lastEnd), highlighted: false })
	}

	return parts
}
