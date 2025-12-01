import type { Block } from '@blocknote/core'

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
 * Get initial content for a new note based on the default note template setting
 * @param template - The template type: 'empty', 'h1', or 'h2'
 * @returns Array of initial blocks
 */
export function getInitialNoteContent(template: 'empty' | 'h1' | 'h2' = 'empty'): Block[] {
    if (template === 'empty') {
        return [
            {
                id: generateBlockId(),
                type: 'paragraph',
                props: {
                    backgroundColor: "default",
                    textColor: "default",
                    textAlignment: "left"
                },
                content: [],
                children: []
            } as Block
        ]
    }

    // Create a heading block
    const level = template === 'h1' ? 1 : 2
    return [
        {
            id: generateBlockId(),
            type: 'heading',
            props: {
                level,
                backgroundColor: "default",
                textColor: "default",
                textAlignment: "left"
            },
            content: [],
            children: []
        } as Block
    ]
}

