/**
 * @fileoverview Batch Operations Tests
 * Tests concurrency limits, early exit, and summary accuracy
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { batchCreate } from './create'
import { batchUpdate } from './update'
import { batchDestroy } from './destroy'
import { setAdapter, resetAdapter } from '../adapter'
import type { StorageAdapter } from '../types/adapter'
import type { BaseEntity } from '../types'
import * as cache from '../cache'

interface TestEntity extends BaseEntity {
    name: string
}

function createMockAdapter(overrides?: Partial<StorageAdapter>): StorageAdapter {
    return {
        create: vi.fn().mockImplementation(async (_, data) => ({
            id: data.id ?? 'mock-id',
            ...data,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        })),
        read: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockImplementation(async (_, id, data) => ({
            id,
            ...data,
            updatedAt: Date.now(),
        })),
        delete: vi.fn().mockResolvedValue(true),
        ...overrides,
    }
}

describe('Batch Operations', () => {
    beforeEach(() => {
        resetAdapter()
        cache.clear()
    })

    describe('batchCreate', () => {
        it('should respect concurrency limit', async () => {
            let activeCalls = 0
            let maxActiveCalls = 0

            const mockAdapter = createMockAdapter({
                create: vi.fn().mockImplementation(async (_, data) => {
                    activeCalls++
                    maxActiveCalls = Math.max(maxActiveCalls, activeCalls)
                    await new Promise((r) => setTimeout(r, 10))
                    activeCalls--
                    return { id: data.id ?? 'id', ...data, createdAt: Date.now(), updatedAt: Date.now() }
                }),
            })
            setAdapter(mockAdapter)

            const items = Array.from({ length: 25 }, (_, i) => ({ name: `Item ${i}` }))

            await batchCreate<TestEntity>('test', items, { concurrency: 5 })

            expect(maxActiveCalls).toBeLessThanOrEqual(5)
        })

        it('should stop on first error when continueOnError is false', async () => {
            const mockAdapter = createMockAdapter({
                create: vi.fn()
                    .mockResolvedValueOnce({ id: '1', name: 'ok', createdAt: 0, updatedAt: 0 })
                    .mockRejectedValueOnce(new Error('Failed'))
                    .mockResolvedValue({ id: '3', name: 'ok', createdAt: 0, updatedAt: 0 }),
            })
            setAdapter(mockAdapter)

            const result = await batchCreate<TestEntity>(
                'test',
                [{ name: '1' }, { name: '2' }, { name: '3' }],
                { concurrency: 1, continueOnError: false }
            )

            expect(result.success).toBe(false)
            expect(result.summary.succeeded).toBe(1)
            expect(result.summary.failed).toBe(1)
            expect(result.summary.skipped).toBe(1)
            expect(result.results.length).toBe(2) // Only processed first 2
        })

        it('should continue on error when continueOnError is true', async () => {
            const mockAdapter = createMockAdapter({
                create: vi.fn()
                    .mockResolvedValueOnce({ id: '1', name: 'ok', createdAt: 0, updatedAt: 0 })
                    .mockRejectedValueOnce(new Error('Failed'))
                    .mockResolvedValue({ id: '3', name: 'ok', createdAt: 0, updatedAt: 0 }),
            })
            setAdapter(mockAdapter)

            const result = await batchCreate<TestEntity>(
                'test',
                [{ name: '1' }, { name: '2' }, { name: '3' }],
                { concurrency: 1, continueOnError: true }
            )

            expect(result.success).toBe(false)
            expect(result.summary.succeeded).toBe(2)
            expect(result.summary.failed).toBe(1)
            expect(result.summary.skipped).toBe(0)
            expect(result.results.length).toBe(3)
        })

        it('should report accurate progress', async () => {
            const mockAdapter = createMockAdapter()
            setAdapter(mockAdapter)

            const progressUpdates: number[] = []
            const items = Array.from({ length: 10 }, (_, i) => ({ name: `Item ${i}` }))

            await batchCreate<TestEntity>('test', items, {
                concurrency: 3,
                onProgress: (p) => progressUpdates.push(p.percentage),
            })

            // Should have ~4 progress updates (10 items, 3 at a time = 4 batches)
            expect(progressUpdates.length).toBeGreaterThan(0)
            expect(progressUpdates[progressUpdates.length - 1]).toBe(100)
        })

        it('should generate unique requestId for each batch operation', async () => {
            const mockAdapter = createMockAdapter()
            setAdapter(mockAdapter)

            const result1 = await batchCreate<TestEntity>('test', [{ name: '1' }])
            const result2 = await batchCreate<TestEntity>('test', [{ name: '2' }])

            expect(result1.meta.requestId).toBeTruthy()
            expect(result2.meta.requestId).toBeTruthy()
            expect(result1.meta.requestId).not.toBe(result2.meta.requestId)
        })
    })

    describe('batchUpdate', () => {
        it('should update all entities and return summary', async () => {
            const mockAdapter = createMockAdapter()
            setAdapter(mockAdapter)

            const result = await batchUpdate<TestEntity>('test', [
                { id: '1', data: { name: 'Updated 1' } },
                { id: '2', data: { name: 'Updated 2' } },
            ])

            expect(result.success).toBe(true)
            expect(result.summary.total).toBe(2)
            expect(result.summary.succeeded).toBe(2)
        })
    })

    describe('batchDestroy', () => {
        it('should delete all entities and return summary', async () => {
            const mockAdapter = createMockAdapter()
            setAdapter(mockAdapter)

            const result = await batchDestroy('test', ['1', '2', '3'])

            expect(result.success).toBe(true)
            expect(result.summary.total).toBe(3)
            expect(result.summary.succeeded).toBe(3)
        })
    })
})
