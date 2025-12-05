import { getDefaultReactSlashMenuItems, type DefaultReactSuggestionItem } from '@blocknote/react'
import { createElement } from 'react'
import { Link2 } from 'lucide-react'

// Simple hash icon for animated number
const HashIcon = () =>
	createElement(
		'svg',
		{
			xmlns: 'http://www.w3.org/2000/svg',
			width: 18,
			height: 18,
			viewBox: '0 0 24 24',
			fill: 'none',
			stroke: 'currentColor',
			strokeWidth: 2,
			strokeLinecap: 'round',
			strokeLinejoin: 'round',
		},
		createElement('line', { x1: 4, x2: 20, y1: 9, y2: 9 }),
		createElement('line', { x1: 4, x2: 20, y1: 15, y2: 15 }),
		createElement('line', { x1: 10, x2: 8, y1: 3, y2: 21 }),
		createElement('line', { x1: 16, x2: 14, y1: 3, y2: 21 })
	)

// At symbol icon for note mention
const AtIcon = () =>
	createElement(
		'svg',
		{
			xmlns: 'http://www.w3.org/2000/svg',
			width: 18,
			height: 18,
			viewBox: '0 0 24 24',
			fill: 'none',
			stroke: 'currentColor',
			strokeWidth: 2,
			strokeLinecap: 'round',
			strokeLinejoin: 'round',
		},
		createElement('circle', { cx: 12, cy: 12, r: 4 }),
		createElement('path', { d: 'M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94' })
	)

export const getCustomSlashMenuItems = (editor: any): DefaultReactSuggestionItem[] => {
	const defaultItems = getDefaultReactSlashMenuItems(editor)

	// Add custom items to the default list
	const customItems: DefaultReactSuggestionItem[] = [
		{
			title: 'Note Mention',
			onItemClick: () => {
				// Insert @ symbol to trigger the mention menu
				editor.insertInlineContent([
					{
						type: 'text',
						text: '@',
						styles: {},
					},
				])
				// Move cursor after @ to trigger mention menu
				const cursorPos = editor.getTextCursorPosition()
				editor.setTextCursorPosition(cursorPos.block, cursorPos.offset + 1)
			},
			aliases: ['mention', 'link', 'reference', 'note'],
			subtext: 'Link to another note',
			icon: createElement(AtIcon),
			group: 'Custom',
		},
		{
			title: 'Animated Number',
			onItemClick: () => {
				editor.insertBlocks(
					[
						{
							type: 'animated-number',
							props: { value: '42' },
						},
					],
					editor.getTextCursorPosition().block,
					'after'
				)
			},
			aliases: ['number', 'counter', 'animation'],
			subtext: 'Animated number display',
			icon: createElement(HashIcon),
			group: 'Custom',
		},
	]

	return [...defaultItems, ...customItems]
}
