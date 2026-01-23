import type { Block } from "@blocknote/core";
import { generateId } from "@skriuw/shared";

/**
 * Get initial content for a new note based on the default note template setting
 * @param template - The template type: 'empty', 'h1', or 'h2'
 * @returns Array of initial blocks
 */
export function getInitialNoteContent(template: 'empty' | 'h1' | 'h2' = 'empty'): Block[] {
	if (template === 'empty') {
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

	/**
	 * The level of the heading
	 */
	const level = template === 'h1' ? 1 : 2
	return [
		{
			id: generateId(),
			type: 'heading',
			props: {
				level,
				backgroundColor: 'default',
				textColor: 'default',
				textAlignment: 'left'
			},
			content: [],
			children: []
		} as Block
	]
}
