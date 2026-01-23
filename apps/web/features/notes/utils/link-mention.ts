import { Block } from "@blocknote/core";

/**
 * Traverses blocks to find the first occurrence of a specific text
 * and replaces it with a wikilink inline content.
 */
export function createLinkInBlocks(
    blocks: Block[],
    targetText: string,
    targetNoteId: string,
    targetNoteName: string
): { success: boolean, newBlocks: Block[] } {
    let modified = false;
    const lowerTarget = targetText.toLowerCase();

    function traverse(currentBlocks: Block[]): Block[] {
        if (modified) return currentBlocks; // Stop if already modified (replace first occurrence)

        return currentBlocks.map(block => {
            if (modified) return block;

            // Check inline content
            if (block.content && Array.isArray(block.content)) {
                const newContent: typeof block.content = [];
                let blockModified = false;

                for (const inline of block.content) {
                    if (blockModified || inline.type !== 'text' || !inline.text) {
                        newContent.push(inline);
                        continue;
                    }

                    const lowerText = inline.text.toLowerCase();
                    const index = lowerText.indexOf(lowerTarget);

                    if (index !== -1 && !modified) {
                        modified = true;
                        blockModified = true;

                        // Verify boundary logic (optional but good: ensuring we don't link partial words?
                        // For now keep simple: simple string replacement matching the regex logic used for detection)

                        // Split text
                        const before = inline.text.substring(0, index);
                        const match = inline.text.substring(index, index + targetText.length);
                        const after = inline.text.substring(index + targetText.length);

                        if (before) {
                            newContent.push({
                                type: 'text',
                                text: before,
                                styles: inline.styles
                            });
                        }

                        newContent.push({
                            type: 'wikilink',
                            props: {
                                noteName: targetNoteName,
                                noteId: targetNoteId
                            }
                        } as any); // Cast because BlockNote types might not know custom schema here

                        if (after) {
                            newContent.push({
                                type: 'text',
                                text: after,
                                styles: inline.styles
                            });
                        }
                    } else {
                        newContent.push(inline);
                    }
                }

                if (blockModified) {
                    return {
                        ...block,
                        content: newContent
                    };
                }
            }

            // check children
            if (block.children && block.children.length > 0) {
                const newChildren = traverse(block.children);
                if (modified) {
                    return {
                        ...block,
                        children: newChildren
                    };
                }
            }

            return block;
        });
    }

    // Clone blocks deeply to avoid mutating original state if needed,
    // but map returns new arrays so shallow reference changes should bubble up.
    // However, BlockNote blocks can be complex.
    // structuredClone is safe.
    const clonedBlocks = JSON.parse(JSON.stringify(blocks));
    const newBlocks = traverse(clonedBlocks);

    return { success: modified, newBlocks };
}
