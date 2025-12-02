import type { Block } from '@blocknote/core'

/**
 * Converts BlockNote blocks to markdown string
 * Recursively traverses blocks and converts them to markdown format
 */
export function blocksToMarkdown(blocks: Block[]): string {
	if (!blocks || blocks.length === 0) {
		return ''
	}

	const markdownLines: string[] = []

	const convertBlock = (block: Block, depth = 0): string[] => {
		const lines: string[] = []
		const indent = '  '.repeat(depth)

		// Handle different block types
		switch (block.type) {
			case 'paragraph': {
				const text = extractTextFromContent(block.content)
				if (text.trim()) {
					lines.push(`${indent}${text}`)
				}
				break
			}

			case 'heading': {
				const level = block.props?.level || 1
				const text = extractTextFromContent(block.content)
				const prefix = '#'.repeat(level)
				lines.push(`${indent}${prefix} ${text}`)
				break
			}

			case 'bulletListItem': {
				const text = extractTextFromContent(block.content)
				lines.push(`${indent}- ${text}`)
				break
			}

			case 'numberedListItem': {
				const text = extractTextFromContent(block.content)
				lines.push(`${indent}1. ${text}`)
				break
			}

			case 'checkListItem': {
				const text = extractTextFromContent(block.content)
				const checked = block.props?.checked || false
				lines.push(`${indent}- [${checked ? 'x' : ' '}] ${text}`)
				break
			}

			case 'quote': {
				const text = extractTextFromContent(block.content)
				const quoteLines = text.split('\n')
				quoteLines.forEach((line) => {
					lines.push(`${indent}> ${line}`)
				})
				break
			}

			case 'codeBlock': {
				const language = (block.props as any)?.language || ''
				const code = extractTextFromContent(block.content) || ''
				lines.push(`${indent}\`\`\`${language}`)
				lines.push(`${indent}${code}`)
				lines.push(`${indent}\`\`\``)
				break
			}

			case 'table': {
				// Convert table to markdown table format
				if (block.content && Array.isArray(block.content)) {
					// Header row
					const headerRow = block.content[0]
					if (headerRow && headerRow.content) {
						const headerCells = extractTableCells(headerRow.content)
						if (headerCells.length > 0) {
							lines.push(`${indent}| ${headerCells.join(' | ')} |`)
							lines.push(`${indent}|${headerCells.map(() => ' --- ').join('|')}|`)
						}
					}

					// Data rows
					for (let i = 1; i < block.content.length; i++) {
						const row = block.content[i]
						if (row && row.content) {
							const cells = extractTableCells(row.content)
							if (cells.length > 0) {
								lines.push(`${indent}| ${cells.join(' | ')} |`)
							}
						}
					}
				}
				break
			}

			case 'divider': {
				lines.push(`${indent}---`)
				break
			}

			default: {
				// Fallback for unknown block types
				const text = extractTextFromContent(block.content)
				if (text.trim()) {
					lines.push(`${indent}${text}`)
				}
				break
			}
		}

		// Process children
		if (block.children && block.children.length > 0) {
			block.children.forEach((child) => {
				const childLines = convertBlock(child, depth + 1)
				lines.push(...childLines)
			})
		}

		return lines
	}

	blocks.forEach((block) => {
		const blockLines = convertBlock(block)
		markdownLines.push(...blockLines)
		// Add blank line between top-level blocks
		markdownLines.push('')
	})

	// Remove trailing empty lines
	while (markdownLines.length > 0 && markdownLines[markdownLines.length - 1].trim() === '') {
		markdownLines.pop()
	}

	return markdownLines.join('\n')
}

/**
 * Extracts plain text from block content
 */
function extractTextFromContent(content: any): string {
	if (!content) return ''

	if (Array.isArray(content)) {
		return content.map(extractTextFromContent).join('')
	}

	if (typeof content === 'string') {
		return content
	}

	if (content && typeof content === 'object') {
		// Handle styled text
		if (content.type === 'text') {
			let text = content.text || ''

			// Apply text formatting
			if (content.styles) {
				const { bold, italic, underline, strike } = content.styles

				if (bold) text = `**${text}**`
				if (italic) text = `*${text}*`
				if (underline) text = `__${text}__`
				if (strike) text = `~~${text}~~`
			}

			return text
		}

		// Handle link content
		if (content.type === 'link') {
			const linkText = extractTextFromContent(content.content)
			return `[${linkText}](${content.href || ''})`
		}

		// Recursively handle other object types
		return extractTextFromContent(content.content)
	}

	return ''
}

/**
 * Extracts text from table cells
 */
function extractTableCells(content: any[]): string[] {
	if (!Array.isArray(content)) return []

	return content
		.map((cell) => {
			if (cell && cell.content) {
				return extractTextFromContent(cell.content)
			}
			return ''
		})
		.filter((text) => text !== '')
}
