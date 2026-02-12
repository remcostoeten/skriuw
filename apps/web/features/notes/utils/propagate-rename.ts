import type { Item, Note } from '../types'
import { flattenNotes } from './flatten-notes'

type PropagationResult = {
    noteId: string
    updatedContent: any[]
}

export function propagateNoteRename(
    items: Item[],
    renamedNoteId: string,
    oldName: string,
    newName: string
): PropagationResult[] {
    if (oldName === newName) return []

    const allNotes = flattenNotes(items).filter(
        (item): item is Note => item.type === 'note' && item.id !== renamedNoteId
    )

    const results: PropagationResult[] = []

    for (const note of allNotes) {
        if (!note.content || !Array.isArray(note.content)) continue

        const updatedContent = updateWikilinksInBlocks(
            note.content,
            renamedNoteId,
            oldName,
            newName
        )

        if (updatedContent.changed) {
            results.push({
                noteId: note.id,
                updatedContent: updatedContent.blocks
            })
        }
    }

    return results
}

function updateWikilinksInBlocks(
    blocks: any[],
    targetNoteId: string,
    oldName: string,
    newName: string
): { blocks: any[]; changed: boolean } {
    let anyChanged = false

    const updatedBlocks = blocks.map((block) => {
        let blockChanged = false
        let updatedContent = block.content

        if (block.content && Array.isArray(block.content)) {
            updatedContent = block.content.map((inline: any) => {
                if (inline.type !== 'wikilink' || !inline.props) return inline

                const matchesById = inline.props.noteId === targetNoteId
                const matchesByName =
                    inline.props.noteName?.toLowerCase() === oldName.toLowerCase()

                if (matchesById || matchesByName) {
                    blockChanged = true
                    return {
                        ...inline,
                        props: {
                            ...inline.props,
                            noteName: newName,
                            noteId: targetNoteId
                        }
                    }
                }

                return inline
            })
        }

        let updatedChildren = block.children
        if (block.children && Array.isArray(block.children) && block.children.length > 0) {
            const childResult = updateWikilinksInBlocks(
                block.children,
                targetNoteId,
                oldName,
                newName
            )
            if (childResult.changed) {
                blockChanged = true
                updatedChildren = childResult.blocks
            }
        }

        if (blockChanged) {
            anyChanged = true
            return { ...block, content: updatedContent, children: updatedChildren }
        }

        return block
    })

    return { blocks: updatedBlocks, changed: anyChanged }
}
