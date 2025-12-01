import type { Block } from '@blocknote/core'

/**
 * Extracts plain text content from BlockNote blocks
 * Recursively traverses blocks and their children to extract all text
 * @param blocks - Array of BlockNote blocks
 * @returns Plain text content from all blocks
 */
export function blocksToText(blocks: Block[]): string {
	if (!blocks || blocks.length === 0) {
		return ''
	}

	const textParts: string[] = []

	const extractText = (block: Block) => {
		// Extract text from block content
		if (block.content && Array.isArray(block.content)) {
			for (const contentItem of block.content) {
				if (typeof contentItem === 'string') {
					textParts.push(contentItem)
				} else if (
					contentItem &&
					typeof contentItem === 'object' &&
					'text' in contentItem
				) {
					textParts.push(String((contentItem as { text: string }).text))
				}
			}
		}

		// Recursively process children
		if (block.children && Array.isArray(block.children) && block.children.length > 0) {
			for (const child of block.children) {
				extractText(child)
			}
		}
	}

	for (const block of blocks) {
		extractText(block)
	}

	return textParts.join(' ').trim()
}

