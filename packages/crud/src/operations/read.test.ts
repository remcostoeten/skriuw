/**
 * @fileoverview Read Operations Tests
 * Tests the read operations used by query functions
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readOne, readMany, batchRead } from './read'
import { setAdapter, resetAdapter } from '../adapter'
import type { StorageAdapter } from '../types/adapter'
import type { BaseEntity } from '../types'
import * as cache from '../cache'

interface TestNote extends BaseEntity {
    name: string
    type: 'note' | 'folder'
    content?: unknown[]
    parentFolderId?: string
}

function createMockAdapter(overrides?: Partial<StorageAdapter>): StorageAdapter {
    return {
        create: vi.fn().mockResolvedValue({}),
        read: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue(true),
        ...overrides,
    }
}

describe('Read Operations', () => {
    beforeEach(() => {
        resetAdapter()
        cache.clear()
    })

    describe('readOne', () => {
        it('should return success with data when entity exists', async () => {
            const mockNote: TestNote = {
                id: 'note-123',
                name: 'Test Note',
                type: 'note',
                content: [],
                createdAt: Date.now(),
                updatedAt: Date.now(),
            }

            const mockAdapter = createMockAdapter({
                read: vi.fn().mockResolvedValue(mockNote),
            })
            setAdapter(mockAdapter)

            const result = await readOne<TestNote>('Skriuw_notes', 'note-123')

            expect(result.success).toBe(true)
            expect(result.data).toEqual(mockNote)
            expect(mockAdapter.read).toHaveBeenCalledWith('Skriuw_notes', { getById: 'note-123' })
        })

        it('should return NOT_FOUND error when entity does not exist', async () => {
            const mockAdapter = createMockAdapter({
                read: vi.fn().mockResolvedValue(undefined),
            })
            setAdapter(mockAdapter)

            const result = await readOne<TestNote>('Skriuw_notes', 'nonexistent')

            expect(result.success).toBe(false)
            expect(result.error?.code).toBe('NOT_FOUND')
        })

        it('should cache results by default', async () => {
            const mockNote: TestNote = {
                id: 'note-123',
                name: 'Test Note',
                type: 'note',
                createdAt: Date.now(),
                updatedAt: Date.now(),
            }

            const mockAdapter = createMockAdapter({
                read: vi.fn().mockResolvedValue(mockNote),
            })
            setAdapter(mockAdapter)

            // First call - should hit adapter
            await readOne<TestNote>('Skriuw_notes', 'note-123')
            expect(mockAdapter.read).toHaveBeenCalledTimes(1)

            // Second call - should hit cache
            const result2 = await readOne<TestNote>('Skriuw_notes', 'note-123')
            expect(result2.success).toBe(true)
            expect(result2.meta.fromCache).toBe(true)
            // Adapter should not be called again (still 1 call)
            expect(mockAdapter.read).toHaveBeenCalledTimes(1)
        })

        it('should bypass cache when forceRefresh is true', async () => {
            const mockNote: TestNote = {
                id: 'note-123',
                name: 'Test Note',
                type: 'note',
                createdAt: Date.now(),
                updatedAt: Date.now(),
            }

            const mockAdapter = createMockAdapter({
                read: vi.fn().mockResolvedValue(mockNote),
            })
            setAdapter(mockAdapter)

            // First call
            await readOne<TestNote>('Skriuw_notes', 'note-123')

            // Second call with forceRefresh
            await readOne<TestNote>('Skriuw_notes', 'note-123', {
                cache: { forceRefresh: true },
            })

            expect(mockAdapter.read).toHaveBeenCalledTimes(2)
        })
    })

    describe('readMany', () => {
        it('should return all entities when no filter is provided', async () => {
            const mockNotes: TestNote[] = [
                { id: '1', name: 'Note 1', type: 'note', createdAt: 100, updatedAt: 100 },
                { id: '2', name: 'Note 2', type: 'note', createdAt: 200, updatedAt: 200 },
                { id: '3', name: 'Folder 1', type: 'folder', createdAt: 300, updatedAt: 300 },
            ]

            const mockAdapter = createMockAdapter({
                read: vi.fn().mockResolvedValue(mockNotes),
            })
            setAdapter(mockAdapter)

            const result = await readMany<TestNote>('Skriuw_notes')

            expect(result.success).toBe(true)
            expect(result.data).toHaveLength(3)
            expect(mockAdapter.read).toHaveBeenCalledWith('Skriuw_notes', { getAll: true })
        })

        it('should apply filter function correctly', async () => {
            const mockNotes: TestNote[] = [
                { id: '1', name: 'Note 1', type: 'note', createdAt: 100, updatedAt: 100 },
                { id: '2', name: 'Note 2', type: 'note', createdAt: 200, updatedAt: 200 },
                { id: '3', name: 'Folder 1', type: 'folder', createdAt: 300, updatedAt: 300 },
            ]

            const mockAdapter = createMockAdapter({
                read: vi.fn().mockResolvedValue(mockNotes),
            })
            setAdapter(mockAdapter)

            const result = await readMany<TestNote>('Skriuw_notes', {
                filter: (item) => item.type === 'note',
            })

            expect(result.success).toBe(true)
            expect(result.data).toHaveLength(2)
            expect(result.data?.every(item => item.type === 'note')).toBe(true)
        })

        it('should apply sort function correctly', async () => {
            const mockNotes: TestNote[] = [
                { id: '1', name: 'Note 1', type: 'note', createdAt: 100, updatedAt: 100 },
                { id: '2', name: 'Note 2', type: 'note', createdAt: 200, updatedAt: 200 },
                { id: '3', name: 'Note 3', type: 'note', createdAt: 300, updatedAt: 300 },
            ]

            const mockAdapter = createMockAdapter({
                read: vi.fn().mockResolvedValue(mockNotes),
            })
            setAdapter(mockAdapter)

            const result = await readMany<TestNote>('Skriuw_notes', {
                sort: (a, b) => b.createdAt - a.createdAt, // Descending
            })

            expect(result.success).toBe(true)
            expect(result.data?.[0].id).toBe('3')
            expect(result.data?.[2].id).toBe('1')
        })

        it('should apply pagination correctly', async () => {
            const mockNotes: TestNote[] = [
                { id: '1', name: 'Note 1', type: 'note', createdAt: 100, updatedAt: 100 },
                { id: '2', name: 'Note 2', type: 'note', createdAt: 200, updatedAt: 200 },
                { id: '3', name: 'Note 3', type: 'note', createdAt: 300, updatedAt: 300 },
                { id: '4', name: 'Note 4', type: 'note', createdAt: 400, updatedAt: 400 },
                { id: '5', name: 'Note 5', type: 'note', createdAt: 500, updatedAt: 500 },
            ]

            const mockAdapter = createMockAdapter({
                read: vi.fn().mockResolvedValue(mockNotes),
            })
            setAdapter(mockAdapter)

            const result = await readMany<TestNote>('Skriuw_notes', {
                offset: 1,
                limit: 2,
            })

            expect(result.success).toBe(true)
            expect(result.data).toHaveLength(2)
            expect(result.data?.[0].id).toBe('2')
            expect(result.data?.[1].id).toBe('3')
        })

        it('should not cache when filter is provided', async () => {
            const mockNotes: TestNote[] = [
                { id: '1', name: 'Note 1', type: 'note', createdAt: 100, updatedAt: 100 },
            ]

            const mockAdapter = createMockAdapter({
                read: vi.fn().mockResolvedValue(mockNotes),
            })
            setAdapter(mockAdapter)

            // First call with filter
            await readMany<TestNote>('Skriuw_notes', {
                filter: (item) => item.type === 'note',
            })

            // Second call with same filter
            await readMany<TestNote>('Skriuw_notes', {
                filter: (item) => item.type === 'note',
            })

            // Should call adapter twice because filter disables caching
            expect(mockAdapter.read).toHaveBeenCalledTimes(2)
        })

        it('should handle empty results', async () => {
            const mockAdapter = createMockAdapter({
                read: vi.fn().mockResolvedValue([]),
            })
            setAdapter(mockAdapter)

            const result = await readMany<TestNote>('Skriuw_notes')

            expect(result.success).toBe(true)
            expect(result.data).toEqual([])
        })
    })

    describe('batchRead', () => {
        it('should read multiple entities by ID', async () => {
            const mockAdapter = createMockAdapter({
                read: vi.fn()
                    .mockResolvedValueOnce({ id: '1', name: 'Note 1', type: 'note', createdAt: 100, updatedAt: 100 })
                    .mockResolvedValueOnce({ id: '2', name: 'Note 2', type: 'note', createdAt: 200, updatedAt: 200 }),
            })
            setAdapter(mockAdapter)

            const result = await batchRead<TestNote>('Skriuw_notes', {
                ids: ['1', '2'],
            })

            expect(result.success).toBe(true)
            expect(result.summary.total).toBe(2)
            expect(result.summary.succeeded).toBe(2)
            expect(result.results).toHaveLength(2)
        })

        it('should handle missing entities when continueOnMissing is true', async () => {
            const mockAdapter = createMockAdapter({
                read: vi.fn()
                    .mockResolvedValueOnce({ id: '1', name: 'Note 1', type: 'note', createdAt: 100, updatedAt: 100 })
                    .mockResolvedValueOnce(undefined), // Not found
            })
            setAdapter(mockAdapter)

            const result = await batchRead<TestNote>('Skriuw_notes', {
                ids: ['1', '2'],
                continueOnMissing: true,
            })

            expect(result.success).toBe(false)
            expect(result.summary.succeeded).toBe(1)
            expect(result.summary.failed).toBe(1)
        })
    })

    describe('API Response Shape Compatibility', () => {
        it('should handle single item response (API returns object, not array)', async () => {
            // This tests compatibility with /api/notes?id=xxx which returns a single object
            const mockNote = {
                id: 'note-123',
                name: 'Test Note',
                type: 'note',
                content: [],
                createdAt: Date.now(),
                updatedAt: Date.now(),
            }

            const mockAdapter = createMockAdapter({
                read: vi.fn().mockResolvedValue(mockNote), // Returns object, not array
            })
            setAdapter(mockAdapter)

            const result = await readOne<TestNote>('Skriuw_notes', 'note-123')

            expect(result.success).toBe(true)
            expect(result.data?.id).toBe('note-123')
        })

        it('should handle array response for getAll', async () => {
            // This tests compatibility with /api/notes which returns array
            const mockNotes = [
                { id: '1', name: 'Note 1', type: 'note', createdAt: 100, updatedAt: 100 },
                { id: '2', name: 'Note 2', type: 'folder', createdAt: 200, updatedAt: 200 },
            ]

            const mockAdapter = createMockAdapter({
                read: vi.fn().mockResolvedValue(mockNotes),
            })
            setAdapter(mockAdapter)

            const result = await readMany<TestNote>('Skriuw_notes')

            expect(result.success).toBe(true)
            expect(Array.isArray(result.data)).toBe(true)
            expect(result.data).toHaveLength(2)
        })

        it('should handle tree structure response (nested folders with children)', async () => {
            // This tests compatibility with /api/notes which returns a tree
            interface TreeNote extends TestNote {
                children?: TreeNote[]
            }

            const mockTree: TreeNote[] = [
                {
                    id: 'folder-1',
                    name: 'Folder 1',
                    type: 'folder',
                    createdAt: 100,
                    updatedAt: 100,
                    children: [
                        { id: 'note-1', name: 'Note 1', type: 'note', createdAt: 150, updatedAt: 150 },
                    ],
                },
                { id: 'note-2', name: 'Note 2', type: 'note', createdAt: 200, updatedAt: 200 },
            ]

            const mockAdapter = createMockAdapter({
                read: vi.fn().mockResolvedValue(mockTree),
            })
            setAdapter(mockAdapter)

            const result = await readMany<TreeNote>('Skriuw_notes')

            expect(result.success).toBe(true)
            expect(result.data).toHaveLength(2)
            expect((result.data?.[0] as TreeNote).children).toHaveLength(1)
        })
    })
})
