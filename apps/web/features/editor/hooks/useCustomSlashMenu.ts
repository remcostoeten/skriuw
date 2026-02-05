import { getDefaultReactSlashMenuItems, type DefaultReactSuggestionItem } from "@blocknote/react";
import { CheckSquare, FolderTree, Info, LayoutTemplate, Link, Image as ImageIcon } from "lucide-react";
import { createElement } from "react";

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
			strokeLinejoin: 'round'
		},
		createElement('circle', { cx: 12, cy: 12, r: 4 }),
		createElement('path', {
			d: 'M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94'
		})
	)

export const getCustomSlashMenuItems = (editor: any): DefaultReactSuggestionItem[] => {
	const defaultItems = getDefaultReactSlashMenuItems(editor)

	// Add custom items to the default list
	const customItems: DefaultReactSuggestionItem[] = [
		{
			title: 'Properties',
			onItemClick: () => {
				const currentBlock = editor.getTextCursorPosition().block
				editor.insertBlocks([{ type: 'header' }], currentBlock, 'after')
			},
			aliases: ['header', 'meta', 'frontmatter', 'props'],
			subtext: 'Add page properties and metadata',
			icon: createElement(LayoutTemplate, { size: 18 }),
			group: 'Basic blocks'
		},
		{
			title: 'Task',
			onItemClick: () => {
				const currentBlock = editor.getTextCursorPosition().block
				// Replace the current block with the task block
				editor.updateBlock(currentBlock, {
					type: 'task',
					props: { checked: false },
					content: []
				})
				// Focus the task block for immediate editing
				setTimeout(() => {
					editor.setTextCursorPosition(currentBlock, 'end')
				}, 0)
			},
			aliases: ['task', 'todo', 'checkbox', 'check'],
			subtext: 'Create a task item',
			icon: createElement(CheckSquare, { size: 18 }),
			group: 'Basic blocks'
		},
		{
			title: 'Note Mention',
			onItemClick: () => {
				// Insert @ symbol to trigger the mention menu
				editor.insertInlineContent([
					{
						type: 'text',
						text: '@',
						styles: {}
					}
				])
				// Move cursor after @ to trigger mention menu
				const cursorPos = editor.getTextCursorPosition()
				editor.setTextCursorPosition(cursorPos.block, cursorPos.offset + 1)
			},
			aliases: ['mention', 'link', 'reference', 'note'],
			subtext: 'Link to another note',
			icon: createElement(AtIcon),
			group: 'Custom'
		},
		{
			title: 'File Tree',
			onItemClick: () => {
				const currentBlock = editor.getTextCursorPosition().block
				editor.insertBlocks(
					[
						{
							type: 'fileTree'
						}
					],
					currentBlock,
					'after' // Try 'after' but ideally replace if empty?
				)
			},
			aliases: ['tree', 'structure', 'folder'],
			subtext: 'Insert a file tree',
			icon: createElement(FolderTree, { size: 18 }),
			group: 'Custom'
		},
		{
			title: 'Callout',
			onItemClick: () => {
				const currentBlock = editor.getTextCursorPosition().block
				editor.insertBlocks(
					[
						{
							type: 'callout',
							props: { type: 'info' }
						}
					],
					currentBlock,
					'after'
				)
			},
			aliases: ['alert', 'info', 'warning', 'error', 'note'],
			subtext: 'Insert an information box',
			icon: createElement(Info, { size: 18 }),
			group: 'Custom'
		},
		{
			title: 'Link',
			onItemClick: () => {
				const url = window.prompt("Enter URL")
				if (url) {
					const text = window.getSelection()?.toString() || url
					editor.createLink(url, text)
					editor.insertInlineContent(" ")
				}
			},
			aliases: ['link', 'url', 'href'],
			subtext: 'Insert a link',
			icon: createElement(Link, { size: 18 }),
			group: 'Basic blocks'
		},
		{
			title: 'Media Library',
			onItemClick: () => {
				// This event is handled by the editor component to show the media picker
				// checking for a specific custom custom event or by passing this handler in
				// For now we'll dispatch a custom event that the editor can listen to
				window.dispatchEvent(new CustomEvent('open-media-library'))
			},
			aliases: ['media', 'image', 'gallery', 'lib'],
			subtext: 'Insert from uploaded files',
			icon: createElement(ImageIcon, { size: 18 }),
			group: 'Media'
		}
	]

	return [...defaultItems, ...customItems]
}
