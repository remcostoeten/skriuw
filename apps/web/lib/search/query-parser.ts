/**
 * Advanced Search Query Parser
 * Supports: tag:, is:, created:, updated:, -exclusion, /regex/, *glob*
 */

export type SearchToken =
	| { type: 'text'; value: string; negated: boolean }
	| { type: 'tag'; value: string; negated: boolean }
	| { type: 'is'; value: 'public' | 'private' | 'pinned' | 'favorite'; negated: boolean }
	| { type: 'created'; operator: '>' | '<' | '=' | '>=' | '<='; value: Date }
	| { type: 'updated'; operator: '>' | '<' | '=' | '>=' | '<='; value: Date }
	| { type: 'folder'; value: string; negated: boolean }
	| { type: 'regex'; pattern: RegExp }
	| { type: 'glob'; value: string; negated: boolean }

export type ParsedQuery = {
	tokens: SearchToken[]
	rawText: string
	hasAdvancedSyntax: boolean
	options: {
		caseSensitive: boolean
		wholeWord: boolean
		useRegex: boolean
	}
}

export type SearchOptions = {
	caseSensitive?: boolean
	wholeWord?: boolean
	useRegex?: boolean
}

const DATE_OPERATORS = ['>=', '<=', '>', '<', '='] as const
type DateOperator = (typeof DATE_OPERATORS)[number]

/**
 * Parse a search query string into structured tokens
 */
export function parseSearchQuery(input: string, options: SearchOptions = {}): ParsedQuery {
	const { caseSensitive = false, wholeWord = false, useRegex = false } = options
	const tokens: SearchToken[] = []
	let hasAdvancedSyntax = false

	// Normalize input
	const normalizedInput = input.trim()
	if (!normalizedInput) {
		return {
			tokens: [],
			rawText: '',
			hasAdvancedSyntax: false,
			options: { caseSensitive, wholeWord, useRegex }
		}
	}

	// Tokenize the input
	const parts = tokenizeInput(normalizedInput)

	for (const part of parts) {
		const token = parseToken(part, { caseSensitive, useRegex })
		if (token) {
			tokens.push(token)
			if (token.type !== 'text') {
				hasAdvancedSyntax = true
			}
		}
	}

	return {
		tokens,
		rawText: normalizedInput,
		hasAdvancedSyntax,
		options: { caseSensitive, wholeWord, useRegex }
	}
}

/**
 * Tokenize input respecting quoted strings
 */
function tokenizeInput(input: string): string[] {
	const tokens: string[] = []
	let current = ''
	let inQuotes = false
	let quoteChar = ''

	for (let i = 0; i < input.length; i++) {
		const char = input[i]

		if ((char === '"' || char === "'") && !inQuotes) {
			inQuotes = true
			quoteChar = char
			current += char
		} else if (char === quoteChar && inQuotes) {
			inQuotes = false
			current += char
			quoteChar = ''
		} else if (char === ' ' && !inQuotes) {
			if (current.trim()) {
				tokens.push(current.trim())
			}
			current = ''
		} else {
			current += char
		}
	}

	if (current.trim()) {
		tokens.push(current.trim())
	}

	return tokens
}

/**
 * Parse a single token into a SearchToken
 */
function parseToken(
	part: string,
	options: { caseSensitive: boolean; useRegex: boolean }
): SearchToken | null {
	if (!part) return null

	// Check for negation prefix
	const negated = part.startsWith('-') || part.startsWith('!')
	const cleanPart = negated ? part.slice(1) : part

	// Check for tag: prefix
	if (cleanPart.toLowerCase().startsWith('tag:')) {
		const value = cleanPart.slice(4).replace(/^["']|["']$/g, '')
		return { type: 'tag', value, negated }
	}

	// Check for is: prefix (public, private, pinned, favorite)
	if (cleanPart.toLowerCase().startsWith('is:')) {
		const value = cleanPart.slice(3).toLowerCase()
		if (['public', 'private', 'pinned', 'favorite'].includes(value)) {
			return { type: 'is', value: value as any, negated }
		}
	}

	// Check for folder: prefix
	if (
		cleanPart.toLowerCase().startsWith('folder:') ||
		cleanPart.toLowerCase().startsWith('in:')
	) {
		const prefix = cleanPart.toLowerCase().startsWith('folder:') ? 'folder:' : 'in:'
		const value = cleanPart.slice(prefix.length).replace(/^["']|["']$/g, '')
		return { type: 'folder', value, negated }
	}

	// Check for created: or updated: with date
	const dateMatch = cleanPart.match(/^(created|updated):(>=?|<=?|=)?(.+)$/i)
	if (dateMatch) {
		const [, field, operator = '=', dateStr] = dateMatch
		const date = parseDate(dateStr)
		if (date) {
			return {
				type: field.toLowerCase() as 'created' | 'updated',
				operator: (operator || '=') as DateOperator,
				value: date
			}
		}
	}

	// Check for regex pattern /pattern/
	if (cleanPart.startsWith('/') && cleanPart.endsWith('/') && cleanPart.length > 2) {
		try {
			const pattern = cleanPart.slice(1, -1)
			const flags = options.caseSensitive ? '' : 'i'
			return { type: 'regex', pattern: new RegExp(pattern, flags) }
		} catch {
			// Invalid regex, treat as text
		}
	}

	// Check for glob pattern (contains * or ?)
	if (cleanPart.includes('*') || cleanPart.includes('?')) {
		return { type: 'glob', value: cleanPart, negated }
	}

	// If useRegex mode is enabled globally, treat as regex
	if (options.useRegex && !negated) {
		try {
			const flags = options.caseSensitive ? '' : 'i'
			return { type: 'regex', pattern: new RegExp(cleanPart, flags) }
		} catch {
			// Invalid regex, fall through to text
		}
	}

	// Default: plain text search
	const value = cleanPart.replace(/^["']|["']$/g, '')
	return { type: 'text', value, negated }
}

/**
 * Parse various date formats
 */
function parseDate(dateStr: string): Date | null {
	const cleaned = dateStr.replace(/^["']|["']$/g, '')

	// Relative dates
	const relativeMatch = cleaned.match(/^(\d+)(d|w|m|y)$/i)
	if (relativeMatch) {
		const [, amount, unit] = relativeMatch
		const date = new Date()
		const num = parseInt(amount, 10)
		switch (unit.toLowerCase()) {
			case 'd':
				date.setDate(date.getDate() - num)
				break
			case 'w':
				date.setDate(date.getDate() - num * 7)
				break
			case 'm':
				date.setMonth(date.getMonth() - num)
				break
			case 'y':
				date.setFullYear(date.getFullYear() - num)
				break
		}
		return date
	}

	// Special keywords
	const lower = cleaned.toLowerCase()
	const now = new Date()
	if (lower === 'today') {
		return new Date(now.getFullYear(), now.getMonth(), now.getDate())
	}
	if (lower === 'yesterday') {
		const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
		d.setDate(d.getDate() - 1)
		return d
	}
	if (lower === 'thisweek') {
		const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
		d.setDate(d.getDate() - d.getDay())
		return d
	}
	if (lower === 'thismonth') {
		return new Date(now.getFullYear(), now.getMonth(), 1)
	}

	// ISO date format (YYYY-MM-DD)
	const isoMatch = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})$/)
	if (isoMatch) {
		const [, year, month, day] = isoMatch
		return new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
	}

	// Try native Date parsing as fallback
	const parsed = new Date(cleaned)
	if (!isNaN(parsed.getTime())) {
		return parsed
	}

	return null
}

/**
 * Convert glob pattern to regex
 */
export function globToRegex(glob: string, caseSensitive: boolean = false): RegExp {
	const escaped = glob
		.replace(/[.+^${}()|[\]\\]/g, '\\$&')
		.replace(/\*/g, '.*')
		.replace(/\?/g, '.')

	const flags = caseSensitive ? '' : 'i'
	return new RegExp(`^${escaped}$`, flags)
}

/**
 * Get syntax highlighting ranges for the query input
 */
export function getQueryHighlightRanges(input: string): Array<{
	start: number
	end: number
	type: 'operator' | 'value' | 'negation' | 'regex'
}> {
	const ranges: Array<{
		start: number
		end: number
		type: 'operator' | 'value' | 'negation' | 'regex'
	}> = []

	// Match operators like tag:, is:, created:, folder:, in:
	const operatorRegex = /(tag|is|created|updated|folder|in):/gi
	let match
	while ((match = operatorRegex.exec(input)) !== null) {
		ranges.push({
			start: match.index,
			end: match.index + match[0].length,
			type: 'operator'
		})
	}

	// Match negation prefixes
	const negationRegex = /(?:^|\s)(-|!)(?=\S)/g
	while ((match = negationRegex.exec(input)) !== null) {
		const negStart = input.indexOf(match[0].trim(), match.index)
		ranges.push({
			start: negStart,
			end: negStart + 1,
			type: 'negation'
		})
	}

	// Match regex patterns
	const regexPattern = /\/[^/]+\//g
	while ((match = regexPattern.exec(input)) !== null) {
		ranges.push({
			start: match.index,
			end: match.index + match[0].length,
			type: 'regex'
		})
	}

	return ranges.sort((a, b) => a.start - b.start)
}
