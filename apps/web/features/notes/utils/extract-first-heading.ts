import type { Block } from '@blocknote/core'

/**
 * Extracts the first heading (# or ##) from BlockNote blocks
 * @param blocks - Array of BlockNote blocks
 * @returns The text content of the first heading, or null if no heading is found
 */
export function extractFirstHeading(blocks: Block[]): string | null {
	if (!blocks || blocks.length === 0) {
		return null
	}

	// Recursively search through blocks and their children
	function findFirstHeading(blockList: Block[]): string | null {
		for (const block of blockList) {
			// Check if this block is a heading (level 1 or 2)
			if (block.type === 'heading' && (block.props?.level === 1 || block.props?.level === 2)) {
				// Extract text content from the heading block
				if (block.content && Array.isArray(block.content)) {
					const textParts: string[] = []
					for (const contentItem of block.content) {
						if (typeof contentItem === 'string') {
							textParts.push(contentItem)
						} else if (contentItem && typeof contentItem === 'object' && 'text' in contentItem) {
							textParts.push(String((contentItem as { text: string }).text))
						}
					}
					const headingText = textParts.join('').trim()
					if (headingText) {
						return headingText
					}
				}
			}

			// Recursively search children
			if (block.children && block.children.length > 0) {
				const childHeading = findFirstHeading(block.children)
				if (childHeading) {
					return childHeading
				}
			}
		}
		return null
	}

	return findFirstHeading(blocks)
}
