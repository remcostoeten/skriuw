import type { Block } from "@blocknote/core";
import { generateId } from "@skriuw/shared";

/**
 * Converts a plain text string into BlockNote blocks.
 * Splits by newlines and creates a paragraph for each non-empty line.
 */
export function stringToBlocks(text: string): Block[] {
	const lines = text.split('\n').filter((line) => line.trim().length > 0)

	if (lines.length === 0) {
		return [
			{
				id: generateId(),
				type: 'paragraph',
				props: {
					backgroundColor: 'default',
					textColor: 'default',
					textAlignment: 'left'
				},
				content: [],
				children: []
			} as Block
		]
	}

	return lines.map(
		(line) =>
			({
				id: generateId(),
				type: 'paragraph',
				props: {
					backgroundColor: 'default',
					textColor: 'default',
					textAlignment: 'left'
				},
				content: [{ type: 'text', text: line, styles: {} }],
				children: []
			}) as Block
	)
}
