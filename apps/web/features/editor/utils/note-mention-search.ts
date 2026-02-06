import type { Item, Note, Folder } from '@/features/notes'

export type NoteMentionCandidate = {
	id: string
	title: string
	path?: string
	updatedAt?: number
}

export type HighlightPart = {
	text: string
	matched: boolean
}

export type NoteMentionSearchResult = NoteMentionCandidate & {
	score: number
	titleHighlights: HighlightPart[]
}

const DEFAULT_LIMIT = 8

export function buildMentionCandidates(items: Item[]): NoteMentionCandidate[] {
	const results: NoteMentionCandidate[] = []

	function visit(current: Item, ancestors: string[]) {
		if (current.type === 'folder') {
			current.children?.forEach((child: any) => visit(child, [...ancestors, current.name]))
			return
		}

		const path = ancestors.length > 0 ? `${ancestors.join(' / ')} / ${current.name}` : undefined

		results.push({
			id: current.id,
			title: current.name,
			path,
			updatedAt: current.updatedAt
		})
	}

	items.forEach((item) => visit(item, []))

	return results
}

export function searchNoteMentions(
	query: string,
	candidates: NoteMentionCandidate[],
	limit: number = DEFAULT_LIMIT
): NoteMentionSearchResult[] {
	const normalizedQuery = query.trim().toLowerCase()

	const scored = candidates
		.map((candidate) => {
			const match = fuzzyScore(candidate.title, normalizedQuery)
			return match
				? {
						...candidate,
						score: match.score,
						titleHighlights: buildHighlightParts(candidate.title, match.matches)
					}
				: null
		})
		.filter((entry): entry is NoteMentionSearchResult => Boolean(entry))
		.sort((a, b) => {
			if (b.score !== a.score) return b.score - a.score
			const aUpdated = a.updatedAt ?? 0
			const bUpdated = b.updatedAt ?? 0
			return bUpdated - aUpdated
		})

	return normalizedQuery ? scored.slice(0, limit) : scored.slice(0, Math.max(limit, 20))
}

type FuzzyMatch = {
	score: number
	matches: number[]
}

function fuzzyScore(text: string, query: string): FuzzyMatch | null {
	if (!query) {
		return {
			score: 0,
			matches: []
		}
	}

	const lowerText = text.toLowerCase()
	const matches: number[] = []
	let lastIndex = -1

	for (const char of query) {
		const index = lowerText.indexOf(char, lastIndex + 1)
		if (index === -1) return null
		matches.push(index)
		lastIndex = index
	}

	const consecutiveBonus = matches.reduce((bonus, matchIndex, idx, arr) => {
		if (idx === 0) return bonus
		return bonus + (matchIndex === arr[idx - 1] + 1 ? 1 : 0)
	}, 0)

	const startBonus = matches.length > 0 && matches[0] === 0 ? 1 : 0

	const score = query.length * 5 + consecutiveBonus * 2 + startBonus

	return { score, matches }
}

function buildHighlightParts(text: string, matches: number[]): HighlightPart[] {
	if (matches.length === 0) {
		return [{ text, matched: false }]
	}

	const flags = new Set(matches)
	const parts: HighlightPart[] = []
	let current = ''
	let currentMatched = flags.has(0)

	for (let i = 0; i < text.length; i++) {
		const char = text[i]
		const isMatch = flags.has(i)

		if (i === 0) {
			currentMatched = isMatch
			current = char
			continue
		}

		if (isMatch === currentMatched) {
			current += char
		} else {
			parts.push({ text: current, matched: currentMatched })
			current = char
			currentMatched = isMatch
		}
	}

	if (current) {
		parts.push({ text: current, matched: currentMatched })
	}

	return parts
}
