import { BlockNoteEditor, Block } from "@blocknote/core";
import { generateId } from "@skriuw/shared";

/**
 * @description Converts markdown text to BlockNote blocks
 * Uses BlockNote's markdown parsing API to convert markdown strings into Block objects
 */
export async function markdownToBlocks(markdown: string): Promise<Block[]> {
	// Return empty array for empty markdown
	if (!markdown || markdown.trim().length === 0) {
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

	let editor: BlockNoteEditor | null = null

	try {
		// Create a temporary editor to parse markdown
		editor = BlockNoteEditor.create({
			initialContent: [
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
				}
			]
		})

		// Method 1: Try using tryParseMarkdownToBlocks (async method)
		// This is the recommended way to parse markdown in BlockNote
		if (editor && typeof (editor as any).tryParseMarkdownToBlocks === 'function') {
			try {
				const blocks = await (editor as any).tryParseMarkdownToBlocks(markdown)

				// Clean up the editor
				if (editor._tiptapEditor) {
					editor._tiptapEditor.destroy()
				}

				// Ensure we return valid blocks array
				if (blocks && Array.isArray(blocks) && blocks.length > 0) {
					return blocks
				}

				console.warn('tryParseMarkdownToBlocks returned empty or invalid array')
			} catch (parseError) {
				console.warn('tryParseMarkdownToBlocks failed:', parseError)
			}
		}

		// Method 2: Use the editor's replaceBlocks with markdown parsing
		// Create a temporary editor, set markdown content, then extract blocks
		if (editor && editor._tiptapEditor) {
			try {
				const tiptapEditor = editor._tiptapEditor

				// Try to parse markdown by setting it as content
				// BlockNote's TipTap editor should handle markdown parsing
				await tiptapEditor.commands.setContent(markdown)

				// Get the blocks from the editor's document
				const blocks = editor.document

				// Clean up
				tiptapEditor.destroy()

				if (blocks && Array.isArray(blocks) && blocks.length > 0) {
					return blocks
				}
			} catch (tiptapError) {
				console.warn('TipTap markdown parsing failed:', tiptapError)
				if (editor._tiptapEditor) {
					editor._tiptapEditor.destroy()
				}
			}
		}

		// Clean up if editor still exists
		if (editor && editor._tiptapEditor) {
			editor._tiptapEditor.destroy()
		}

		// Fallback: Create a simple paragraph block with the markdown text
		// This ensures content is always displayed, even if parsing fails
		console.warn('All markdown parsing methods failed, using fallback paragraph block')
		return [
			{
				id: generateId(),
				type: 'paragraph',
				props: {
					backgroundColor: 'default',
					textColor: 'default',
					textAlignment: 'left'
				},
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

		// Clean up editor if it exists
		if (editor && editor._tiptapEditor) {
			try {
				editor._tiptapEditor.destroy()
			} catch (cleanupError) {
				// Ignore cleanup errors
			}
		}

		// Fallback: create a simple paragraph block with the markdown text
		return [
			{
				id: generateId(),
				type: 'paragraph',
				props: {
					backgroundColor: 'default',
					textColor: 'default',
					textAlignment: 'left'
				},
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
