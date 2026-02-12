'use client'

/**
 * Code Block Input Rule
 * Handles the ``` + space markdown trigger to insert a code block
 */

import type { BlockNoteEditor } from '@blocknote/core'

/**
 * Register the code block markdown trigger
 * Detects ``` followed by space and converts to code block
 *
 * This is implemented as a DOM event listener since BlockNote doesn't
 * expose input rules directly for custom blocks
 */
export function registerCodeBlockTrigger(
    editor: BlockNoteEditor<any, any, any>,
    containerElement: HTMLElement
) {
    let buffer = ''

    const handleKeyDown = (e: KeyboardEvent) => {
        // Only handle regular character keys and space
        if (e.key === '`') {
            buffer += '`'
        } else if (e.key === ' ' && buffer === '```') {
            // Trigger! ``` + space detected
            e.preventDefault()

            const currentBlock = editor.getTextCursorPosition().block

            // Check if current block is a paragraph with only the backticks
            if (currentBlock.type === 'paragraph') {
                const content = currentBlock.content
                if (
                    Array.isArray(content) &&
                    content.length === 1 &&
                    content[0].type === 'text' &&
                    content[0].text === '```'
                ) {
                    // Replace with code block
                    editor.updateBlock(currentBlock, {
                        type: 'codeBlock' as any,
                        props: {
                            language: 'typescript',
                            fileName: 'untitled.ts',
                            code: ''
                        },
                        content: undefined
                    })

                    // Focus will be handled by the block's autoFocus prop
                    buffer = ''
                    return
                }
            }

            buffer = ''
        } else if (e.key === 'Backspace') {
            buffer = buffer.slice(0, -1)
        } else if (e.key.length === 1) {
            // Any other character resets the buffer
            buffer = ''
        }
    }

    containerElement.addEventListener('keydown', handleKeyDown, true)

    // Return cleanup function
    return () => {
        containerElement.removeEventListener('keydown', handleKeyDown, true)
    }
}
