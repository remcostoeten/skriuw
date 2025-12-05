import { getDefaultReactSlashMenuItems, type DefaultReactSuggestionItem } from '@blocknote/react'
import { createElement } from 'react'

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

export const getCustomSlashMenuItems = (editor: any): DefaultReactSuggestionItem[] => {
	const defaultItems = getDefaultReactSlashMenuItems(editor)

	// Add custom items to the default list
	const customItems: DefaultReactSuggestionItem[] = [
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
