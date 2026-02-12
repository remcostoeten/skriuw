import { propagateNoteRename } from '../../features/notes/utils/propagate-rename'
import { describe, expect, it } from 'vitest'

describe('propagateNoteRename', () => {
    const makeNote = (id: string, name: string, content: any[]) => ({
        id,
        name,
        type: 'note' as const,
        content,
        createdAt: Date.now(),
        updatedAt: Date.now()
    })

    it('updates wikilinks matching by noteId', () => {
        const items = [
            makeNote('note-a', 'Alpha', [
                {
                    type: 'paragraph',
                    content: [
                        {
                            type: 'wikilink',
                            props: { noteName: 'Old Name', noteId: 'note-b' }
                        }
                    ]
                }
            ]),
            makeNote('note-b', 'New Name', [])
        ]

        const results = propagateNoteRename(items, 'note-b', 'Old Name', 'New Name')
        expect(results).toHaveLength(1)
        expect(results[0].noteId).toBe('note-a')

        const updatedWikilink = results[0].updatedContent[0].content[0]
        expect(updatedWikilink.props.noteName).toBe('New Name')
        expect(updatedWikilink.props.noteId).toBe('note-b')
    })

    it('updates wikilinks matching by old name', () => {
        const items = [
            makeNote('note-a', 'Alpha', [
                {
                    type: 'paragraph',
                    content: [
                        {
                            type: 'wikilink',
                            props: { noteName: 'Beta', noteId: '' }
                        }
                    ]
                }
            ])
        ]

        const results = propagateNoteRename(items, 'note-b', 'Beta', 'Gamma')
        expect(results).toHaveLength(1)
        expect(results[0].updatedContent[0].content[0].props.noteName).toBe('Gamma')
    })

    it('skips the renamed note itself', () => {
        const items = [
            makeNote('note-a', 'Alpha', [
                {
                    type: 'paragraph',
                    content: [
                        {
                            type: 'wikilink',
                            props: { noteName: 'Alpha', noteId: 'note-a' }
                        }
                    ]
                }
            ])
        ]

        const results = propagateNoteRename(items, 'note-a', 'Alpha', 'Beta')
        expect(results).toHaveLength(0)
    })

    it('returns empty array when names are identical', () => {
        const items = [
            makeNote('note-a', 'Alpha', [
                {
                    type: 'paragraph',
                    content: [
                        {
                            type: 'wikilink',
                            props: { noteName: 'Same', noteId: 'note-b' }
                        }
                    ]
                }
            ])
        ]

        const results = propagateNoteRename(items, 'note-b', 'Same', 'Same')
        expect(results).toHaveLength(0)
    })

    it('handles nested child blocks', () => {
        const items = [
            makeNote('note-a', 'Alpha', [
                {
                    type: 'paragraph',
                    content: [],
                    children: [
                        {
                            type: 'paragraph',
                            content: [
                                {
                                    type: 'wikilink',
                                    props: { noteName: 'Old', noteId: 'note-b' }
                                }
                            ]
                        }
                    ]
                }
            ])
        ]

        const results = propagateNoteRename(items, 'note-b', 'Old', 'New')
        expect(results).toHaveLength(1)
        expect(results[0].updatedContent[0].children[0].content[0].props.noteName).toBe('New')
    })

    it('does not modify notes without matching wikilinks', () => {
        const items = [
            makeNote('note-a', 'Alpha', [
                {
                    type: 'paragraph',
                    content: [
                        {
                            type: 'wikilink',
                            props: { noteName: 'Unrelated', noteId: 'note-c' }
                        }
                    ]
                }
            ])
        ]

        const results = propagateNoteRename(items, 'note-b', 'Old', 'New')
        expect(results).toHaveLength(0)
    })
})
