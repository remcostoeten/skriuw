import { describe, it, expect } from 'vitest'
import { findItemById, findFolderById, isDescendant } from './tree-helpers'
import type { Item, Folder, Note } from '../types'

describe('tree-helpers', () => {
    const mockItems: Item[] = [
        {
            id: 'folder-1',
            name: 'Folder 1',
            type: 'folder',
            children: [
                {
                    id: 'note-1',
                    name: 'Note 1',
                    type: 'note',
                    content: [],
                } as Note,
                {
                    id: 'folder-2',
                    name: 'Folder 2',
                    type: 'folder',
                    children: [
                        {
                            id: 'note-2',
                            name: 'Note 2',
                            type: 'note',
                            content: [],
                        } as Note,
                    ],
                } as Folder,
            ],
        } as Folder,
        {
            id: 'note-3',
            name: 'Note 3',
            type: 'note',
            content: [],
        } as Note,
    ]

    describe('findItemById', () => {
        it('should find a root item', () => {
            const item = findItemById(mockItems, 'folder-1')
            expect(item).toBeDefined()
            expect(item?.id).toBe('folder-1')
        })

        it('should find a nested item', () => {
            const item = findItemById(mockItems, 'note-2')
            expect(item).toBeDefined()
            expect(item?.id).toBe('note-2')
        })

        it('should return undefined if item not found', () => {
            const item = findItemById(mockItems, 'non-existent')
            expect(item).toBeUndefined()
        })
    })

    describe('findFolderById', () => {
        it('should find a folder', () => {
            const folder = findFolderById(mockItems, 'folder-1')
            expect(folder).toBeDefined()
            expect(folder?.id).toBe('folder-1')
            expect(folder?.type).toBe('folder')
        })

        it('should return null if item is found but not a folder', () => {
            const folder = findFolderById(mockItems, 'note-1')
            expect(folder).toBeNull()
        })

        it('should return null if folder not found', () => {
            const folder = findFolderById(mockItems, 'non-existent')
            expect(folder).toBeNull()
        })
    })

    describe('isDescendant', () => {
        it('should return true for a direct child', () => {
            const result = isDescendant(mockItems, 'folder-1', 'note-1')
            expect(result).toBe(true)
        })

        it('should return true for a nested child', () => {
            const result = isDescendant(mockItems, 'folder-1', 'note-2')
            expect(result).toBe(true)
        })

        it('should return false if not a descendant', () => {
            const result = isDescendant(mockItems, 'folder-2', 'note-1')
            expect(result).toBe(false)
        })

        it('should return false if parent folder not found', () => {
            const result = isDescendant(mockItems, 'non-existent', 'note-1')
            expect(result).toBe(false)
        })
    })
})
