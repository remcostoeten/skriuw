import { setAdapter, resetAdapter } from "../adapter";
import * as cache from "../cache";
import type { BaseEntity, ValidationResult } from "../types";
import type { StorageAdapter } from "../types/adapter";
import { create } from "./create";
import { describe, it, expect, beforeEach, vi } from "vitest";

type TestEntity = {
	name: string
	processed?: boolean
} & BaseEntity

function createMockAdapter(overrides?: Partial<StorageAdapter>): StorageAdapter {
	return {
		create: vi.fn().mockImplementation(async (_, data) => ({
			...data,
			id: data.id ?? 'generated-id',
			createdAt: Date.now(),
			updatedAt: Date.now()
		})),
		read: vi.fn().mockResolvedValue([]),
		update: vi.fn().mockResolvedValue(undefined),
		delete: vi.fn().mockResolvedValue(true),
		...overrides
	}
}

describe('create', () => {
	beforeEach(() => {
		resetAdapter()
		cache.clear()
	})

	describe('Validation Flow', () => {
		it('should return VALIDATION_ERROR when validate returns invalid', async () => {
			const mockAdapter = createMockAdapter()
			setAdapter(mockAdapter)

			const result = await create<TestEntity>(
				'test',
				{ name: '' },
				{
					validate: (data): ValidationResult => ({
						valid: false,
						errors: [{ field: 'name', message: 'Name is required', code: 'required' }]
					})
				}
			)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe('VALIDATION_ERROR')
			expect(result.error?.details?.errors).toHaveLength(1)
			expect(mockAdapter.create).not.toHaveBeenCalled()
		})

		it('should proceed when validate returns valid', async () => {
			const mockAdapter = createMockAdapter()
			setAdapter(mockAdapter)

			const result = await create<TestEntity>(
				'test',
				{ name: 'Valid' },
				{
					validate: (): ValidationResult => ({ valid: true })
				}
			)

			expect(result.success).toBe(true)
			expect(mockAdapter.create).toHaveBeenCalled()
		})
	})

	describe('Transform Order', () => {
		it('should call transform after validate passes', async () => {
			const mockAdapter = createMockAdapter()
			setAdapter(mockAdapter)
			const callOrder: string[] = []

			await create<TestEntity>(
				'test',
				{ name: 'Test' },
				{
					validate: () => {
						callOrder.push('validate')
						return { valid: true }
					},
					transform: (data) => {
						callOrder.push('transform')
						return { ...data, processed: true }
					}
				}
			)

			expect(callOrder).toEqual(['validate', 'transform'])
		})

		it('should not call transform when validate fails', async () => {
			const mockAdapter = createMockAdapter()
			setAdapter(mockAdapter)
			const transformCalled = vi.fn()

			await create<TestEntity>(
				'test',
				{ name: '' },
				{
					validate: () => ({ valid: false, errors: [] }),
					transform: (data) => {
						transformCalled()
						return data
					}
				}
			)

			expect(transformCalled).not.toHaveBeenCalled()
		})

		it('should pass transformed data to adapter', async () => {
			const mockAdapter = createMockAdapter()
			setAdapter(mockAdapter)

			await create<TestEntity>(
				'test',
				{ name: 'Original' },
				{
					transform: (data) => ({ ...data, name: 'Transformed' })
				}
			)

			expect(mockAdapter.create).toHaveBeenCalledWith(
				'test',
				expect.objectContaining({ name: 'Transformed' }),
				expect.anything()
			)
		})
	})

	describe('ID Handling', () => {
		it('should use customId when provided', async () => {
			const mockAdapter = createMockAdapter()
			setAdapter(mockAdapter)

			await create<TestEntity>(
				'test',
				{ name: 'Test' },
				{
					customId: 'my-custom-id'
				}
			)

			expect(mockAdapter.create).toHaveBeenCalledWith(
				'test',
				expect.objectContaining({ id: 'my-custom-id' }),
				expect.anything()
			)
		})

		it('should use id from data when provided', async () => {
			const mockAdapter = createMockAdapter()
			setAdapter(mockAdapter)

			await create<TestEntity>('test', { name: 'Test', id: 'data-id' } as any)

			expect(mockAdapter.create).toHaveBeenCalledWith(
				'test',
				expect.objectContaining({ id: 'data-id' }),
				undefined
			)
		})

		it('should prefer customId over data.id', async () => {
			const mockAdapter = createMockAdapter()
			setAdapter(mockAdapter)

			await create<TestEntity>('test', { name: 'Test', id: 'data-id' } as any, {
				customId: 'custom-id'
			})

			expect(mockAdapter.create).toHaveBeenCalledWith(
				'test',
				expect.objectContaining({ id: 'custom-id' }),
				expect.anything()
			)
		})

		it('should generate ID when not provided', async () => {
			const mockAdapter = createMockAdapter()
			setAdapter(mockAdapter)

			await create<TestEntity>('test', { name: 'Test' })

			expect(mockAdapter.create).toHaveBeenCalledWith(
				'test',
				expect.objectContaining({
					id: expect.stringMatching(/^test_\d+_\w+$/)
				}),
				undefined
			)
		})
	})

	describe('Optimistic Updates', () => {
		it('should mark result as optimistic and return entity shape immediately', async () => {
			const mockAdapter = createMockAdapter()
			setAdapter(mockAdapter)

			const result = await create<TestEntity>(
				'test',
				{ name: 'Test' },
				{
					optimistic: true
				}
			)

			expect(result.success).toBe(true)
			expect(result.meta.optimistic).toBe(true)
			expect(result.data).toMatchObject({ name: 'Test' })
			expect(result.data?.id).toBeDefined() // Has generated ID
		})

		it('should call onOptimisticSettled with success after adapter resolves', async () => {
			const mockAdapter = createMockAdapter()
			setAdapter(mockAdapter)
			const settledCallback = vi.fn()

			await create<TestEntity>(
				'test',
				{ name: 'Test' },
				{
					optimistic: true,
					onOptimisticSettled: settledCallback
				}
			)

			// Wait for microtask to complete
			await new Promise((r) => setTimeout(r, 10))

			expect(settledCallback).toHaveBeenCalledWith(expect.objectContaining({ success: true }))
		})

		it('should call onOptimisticSettled with error on failure', async () => {
			const mockAdapter = createMockAdapter({
				create: vi.fn().mockRejectedValue(new Error('Failed'))
			})
			setAdapter(mockAdapter)
			const settledCallback = vi.fn()

			await create<TestEntity>(
				'test',
				{ name: 'Test' },
				{
					optimistic: true,
					onOptimisticSettled: settledCallback
				}
			)

			// Wait for microtask to complete
			await new Promise((r) => setTimeout(r, 10))

			expect(settledCallback).toHaveBeenCalledWith(
				expect.objectContaining({ success: false })
			)
		})
	})
})
