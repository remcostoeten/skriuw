'use client'

import type { BlockNoteEditor } from '@blocknote/core'

export function registerCodeBlockTrigger(
	editor: BlockNoteEditor<any, any, any>,
	containerElement: HTMLElement
) {
	let buffer = ''

	const handleKeyDown = (e: KeyboardEvent) => {
		if (e.key === '`') {
			buffer += '`'
		} else if (e.key === ' ' && buffer === '```') {
			e.preventDefault()

			const currentBlock = editor.getTextCursorPosition().block

			if (currentBlock.type === 'paragraph') {
				const content = currentBlock.content
				if (
					Array.isArray(content) &&
					content.length === 1 &&
					content[0].type === 'text' &&
					(content[0] as { type: 'text'; text: string }).text === '```'
				) {
					editor.updateBlock(currentBlock, {
						type: 'codeBlock' as any,
						props: {
							language: 'typescript',
							code: '',
							autoFocus: true
						},
						content: undefined
					})

					buffer = ''
					return
				}
			}

			buffer = ''
		} else if (e.key === 'Backspace') {
			buffer = buffer.slice(0, -1)
		} else if (e.key.length === 1) {
			buffer = ''
		}
	}

	containerElement.addEventListener('keydown', handleKeyDown, true)

	return () => {
		containerElement.removeEventListener('keydown', handleKeyDown, true)
	}
}
