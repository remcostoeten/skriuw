import { describe, it, expect, mock, beforeEach, beforeAll } from 'bun:test'
import { NextRequest } from 'next/server'

// Mock auth - must be set up before dynamic imports
const mockRequireMutation = mock()
const mockAllowReadAccess = mock()
const mockGetSession = mock()

mock.module('@/lib/api-auth', () => ({
	requireMutation: mockRequireMutation,
	allowReadAccess: mockAllowReadAccess,
	GUEST_USER_ID: 'guest-id'
}))

mock.module('@/lib/auth', () => ({
	auth: { api: { getSession: mockGetSession } }
}))

// Mock DB - chainable mock that returns itself for query building
const createChainableMock = () => {
	const results: any[] = []
	let resultIndex = 0

	const chain: any = {
		_results: results,
		_setResults: (r: any[]) => {
			results.length = 0
			results.push(...r)
			resultIndex = 0
		},
		select: mock(() => chain),
		from: mock(() => chain),
		where: mock(() => chain),
		limit: mock(() => chain),
		offset: mock(() => chain),
		orderBy: mock(() => chain),
		insert: mock(() => chain),
		values: mock(() => chain),
		update: mock(() => chain),
		set: mock(() => chain),
		delete: mock(() => chain),
		returning: mock(() => chain),
		then: (resolve: any) => resolve(results[resultIndex++] ?? [])
	}
	return chain
}

const mockDb = createChainableMock()

mock.module('@skriuw/db', () => ({
	getDatabase: () => mockDb,
	files: {
		id: 'files.id',
		userId: 'files.userId',
		name: 'files.name',
		size: 'files.size',
		createdAt: 'files.createdAt'
	},
	eq: (a: any, b: any) => ({ type: 'eq', a, b }),
	and: (...args: any[]) => ({ type: 'and', args }),
	like: (a: any, b: any) => ({ type: 'like', a, b }),
	desc: (col: any) => ({ type: 'desc', col }),
	asc: (col: any) => ({ type: 'asc', col })
}))

mock.module('@skriuw/shared', () => ({
	generateId: () => 'new-file-id'
}))

// Dynamic imports after mocks are set up
let GET: any, DELETE: any, PATCH: any

beforeAll(async () => {
	const assetsRoute = await import('@/app/api/assets/route')
	GET = assetsRoute.GET
	DELETE = assetsRoute.DELETE

	const assetIdRoute = await import('@/app/api/assets/[id]/route')
	PATCH = assetIdRoute.PATCH
})

describe('Assets API', () => {
	beforeEach(() => {
		mockRequireMutation.mockReset()
		mockAllowReadAccess.mockReset()
		// Reset chainable mock results
		mockDb._setResults([])
	})

	describe('GET /api/assets', () => {
		it('should return empty list for guest', async () => {
			mockAllowReadAccess.mockResolvedValue('guest-id')
			const req = new NextRequest('http://localhost/api/assets')

			const res = await GET(req)
			const data = await res.json()

			expect(data.items).toEqual([])
			expect(data.total).toEqual(0)
		})

		it('should query db for authenticated user', async () => {
			mockAllowReadAccess.mockResolvedValue('user-1')
			const req = new NextRequest('http://localhost/api/assets?limit=10')

			// Set up results: first for count query, second for items query
			mockDb._setResults([[{ count: 1 }], [{ id: '1', name: 'test' }]])

			const res = await GET(req)
			const data = await res.json()

			expect(data.items).toHaveLength(1)
			expect(data.total).toEqual(1)
		})
	})

	describe('DELETE /api/assets', () => {
		it('should delete file if owned by user', async () => {
			mockRequireMutation.mockResolvedValue({ authenticated: true, userId: 'user-1' })
			const req = new NextRequest('http://localhost/api/assets?id=file-1')

			mockDb._setResults([[{ id: 'file-1', storageProvider: 'local-fs' }], []])

			const res = await DELETE(req)
			const data = await res.json()

			expect(data.success).toBe(true)
		})
	})

	describe('PATCH /api/assets/[id]', () => {
		it('should update file name', async () => {
			mockRequireMutation.mockResolvedValue({ authenticated: true, userId: 'user-1' })
			const req = new NextRequest('http://localhost/api/assets/file-1', {
				method: 'PATCH',
				body: JSON.stringify({ name: 'new name' })
			})

			mockDb._setResults([[{ id: 'file-1' }], [{ id: 'file-1', name: 'new name' }]])

			const res = await PATCH(req, { params: Promise.resolve({ id: 'file-1' }) })
			const data = await res.json()

			expect(data.name).toBe('new name')
		})
	})
})
