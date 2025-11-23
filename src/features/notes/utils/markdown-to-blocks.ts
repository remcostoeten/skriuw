import { BlockNoteEditor, Block } from '@blocknote/core'

/**
 * Generate a simple ID for blocks
 */
function generateBlockId(): string {
    return (
        Math.random().toString(36).substring(2, 15) +
        Math.random().toString(36).substring(2, 15)
    )
}

/**
 * @description Converts markdown text to BlockNote blocks
 */
export async function markdownToBlocks(markdown: string): Promise<Block[]> {
    try {
        // Create a temporary editor to parse markdown
        const editor = BlockNoteEditor.create({
            initialContent: []
        })

        // BlockNote can parse markdown using tryParseMarkdownToBlocks
        // Check if the method exists
        if (typeof editor.tryParseMarkdownToBlocks === 'function') {
            const blocks = editor.tryParseMarkdownToBlocks(markdown)
            editor._tiptapEditor.destroy()
            return blocks
        }

        // Fallback: Use the editor's markdown parsing via tiptap
        // BlockNote uses TipTap under the hood, which can parse markdown
        const tiptapEditor = editor._tiptapEditor
        if (tiptapEditor) {
            // Try to set content from markdown
            tiptapEditor.commands.setContent(markdown)
            const blocks = editor.document
            tiptapEditor.destroy()
            return blocks
        }

        // If all else fails, create a simple paragraph block
        editor._tiptapEditor.destroy()
        return [
            {
                id: generateBlockId(),
                type: 'paragraph',
                props: {},
                content: [
                    {
                        type: 'text',
                        text: markdown,
                        styles: {}
                    }
                ],
                children: []
            } as Block
        ]
    } catch (error) {
        console.error('Failed to parse markdown to blocks:', error)
        // Fallback: create a simple paragraph block with the markdown text
        return [
            {
                id: generateBlockId(),
                type: 'paragraph',
                props: {},
                content: [
                    {
                        type: 'text',
                        text: markdown,
                        styles: {}
                    }
                ],
                children: []
            } as Block
        ]
    }
}
