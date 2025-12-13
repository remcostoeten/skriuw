
// Minimal interface for BlockNote blocks to avoid hard dependency
type InlineContent = {
    type?: string;
    text?: string;
    [key: string]: unknown;
};

export interface BlockContent {
    type: string;
    content?: string | InlineContent[];
    children?: BlockContent[];
    [key: string]: unknown;
}

/**
 * Determines if a revision should be created based on content changes.
 * Ignores whitespace and simple formatting changes if configured.
 * 
 * @param oldBlocks Previous state of blocks
 * @param newBlocks Current state of blocks
 * @param options Configuration options
 * @returns true if a revision should be saved
 */
export function shouldCreateRevision(
    oldBlocks: BlockContent[],
    newBlocks: BlockContent[],
    options: { ignoreWhitespace: boolean } = { ignoreWhitespace: true }
): boolean {
    // 1. Structural Check: If number of blocks changed, it's definitely a change
    if (oldBlocks.length !== newBlocks.length) {
        return true;
    }

    // 2. Content Check
    const oldText = normalizeContent(oldBlocks, options.ignoreWhitespace);
    const newText = normalizeContent(newBlocks, options.ignoreWhitespace);

    return oldText !== newText;
}

function normalizeContent(blocks: BlockContent[], ignoreWhitespace: boolean): string {
    return blocks.map(block => {
        let text = '';

        // Extract text from content
        if (Array.isArray(block.content)) {
            // BlockNote content is an array of inline content objects
            text = block.content
                .map((c: InlineContent) =>
                    c.type === 'text' || !c.type ? c.text ?? '' : ''
                )
                .join('');
        } else if (typeof block.content === 'string') {
            text = block.content;
        }

        // Recursively handle children
        const childrenText = block.children
            ? normalizeContent(block.children, ignoreWhitespace)
            : '';

        const fullText = text + childrenText;

        return ignoreWhitespace ? fullText.replace(/\s+/g, '') : fullText;
    }).join('');
}
