import { beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test'
import { NextRequest } from 'next/server'

const mockRequireAuth = mock()
const mockRequireMutation = mock()
const mockAllowReadAccess = mock()

mock.module('@/lib/api-auth', () => ({
	requireAuth: mockRequireAuth,
	requireMutation: mockRequireMutation,
	allowReadAccess: mockAllowReadAccess,
	GUEST_USER_ID: 'guest-user'
}))

const mockServerDb = {
	findAll: mock(async () => []),
	findById: mock(async () => null),
	create: mock(async () => ({})),
	update: mock(async () => null),
	delete: mock(async () => false),
	upsert: mock(async () => ({}))
}

mock.module('@/lib/storage/adapters/server-db', () => ({
	db: mockServerDb
}))

mock.module('@/features/backup/core/connector-secrets', () => ({
	encryptConnectorStates: (value: unknown) => value,
	decryptConnectorStates: (value: unknown) => value
}))

mock.module('@/features/ai/utilities', () => ({
	encryptPrompt: (value: string) => value,
	decryptPrompt: (value: string) => value
}))

const createChainableMock = () => {
	const results: any[] = []
	let resultIndex = 0

	const chain: any = {
		_setResults: (r: any[]) => {
			results.length = 0
			results.push(...r)
			resultIndex = 0
		},
		select: mock(() => chain),
		from: mock(() => chain),
		where: mock(() => chain),
		limit: mock(() => chain),
		insert: mock(() => chain),
		values: mock(() => chain),
		update: mock(() => chain),
		set: mock(() => chain),
		delete: mock(() => chain),
		transaction: mock(async (cb: any) => cb(chain)),
		onConflictDoUpdate: mock(async () => undefined),
		then: (resolve: any) => resolve(results[resultIndex++] ?? [])
	}

	return chain
}

const mockSqlDb = createChainableMock()

mock.module('@skriuw/db', () => ({
	getDatabase: () => mockSqlDb,
	getSafeTimestamp: () => 1700000000000,
	notes: { id: 'notes.id', userId: 'notes.userId' },
	folders: { id: 'folders.id', userId: 'folders.userId' },
	tasks: { id: 'tasks.id', userId: 'tasks.userId', noteId: 'tasks.noteId' },
	aiProviderConfig: { id: 'ai.id', userId: 'ai.userId', isActive: 'ai.isActive' },
	eq: (a: unknown, b: unknown) => ({ type: 'eq', a, b }),
	and: (...args: unknown[]) => ({ type: 'and', args })
}))

mock.module('drizzle-orm', () => ({
	eq: (a: unknown, b: unknown) => ({ type: 'eq', a, b }),
	and: (...args: unknown[]) => ({ type: 'and', args }),
	sql: () => ({})
}))

let notesPost: typeof import('@/app/api/notes/route').POST
let notesPut: typeof import('@/app/api/notes/route').PUT
let settingsPost: typeof import('@/app/api/settings/route').POST
let tasksSyncPost: typeof import('@/app/api/tasks/sync/route').POST
let importPost: typeof import('@/app/api/import/route').POST
let aiConfigPost: typeof import('@/app/api/ai/config/route').POST

beforeAll(async () => {
	;({ POST: notesPost, PUT: notesPut } = await import('@/app/api/notes/route'))
	;({ POST: settingsPost } = await import('@/app/api/settings/route'))
	;({ POST: tasksSyncPost } = await import('@/app/api/tasks/sync/route'))
	;({ POST: importPost } = await import('@/app/api/import/route'))
	;({ POST: aiConfigPost } = await import('@/app/api/ai/config/route'))
})

beforeEach(() => {
	mockRequireAuth.mockReset()
	mockRequireMutation.mockReset()
	mockAllowReadAccess.mockReset()
	mockRequireAuth.mockResolvedValue({ authenticated: true, userId: 'user-1' })
	mockRequireMutation.mockResolvedValue({ authenticated: true, userId: 'user-1' })
	mockAllowReadAccess.mockResolvedValue('user-1')

	mockServerDb.create.mockClear()
	mockServerDb.update.mockClear()
	mockServerDb.upsert.mockClear()

	mockSqlDb._setResults([])
	mockSqlDb.select.mockClear()
	mockSqlDb.transaction.mockClear()
})

describe('API payload validation', () => {
	it('POST /api/notes returns 400 with validation details', async () => {
		const response = await notesPost(
			new NextRequest('http://localhost/api/notes', {
				method: 'POST',
				body: JSON.stringify({ type: 'note' })
			})
		)

		expect(response.status).toBe(400)
		const json = await response.json()
		expect(json.error).toBe('Invalid payload')
		expect(json.details.fieldErrors.name).toBeDefined()
		expect(mockServerDb.create).not.toHaveBeenCalled()
	})

	it('PUT /api/notes returns 400 with validation details', async () => {
		const response = await notesPut(
			new NextRequest('http://localhost/api/notes', {
				method: 'PUT',
				body: JSON.stringify({ name: 'Missing id' })
			})
		)

		expect(response.status).toBe(400)
		const json = await response.json()
		expect(json.error).toBe('Invalid payload')
		expect(json.details.fieldErrors.id).toBeDefined()
		expect(mockServerDb.update).not.toHaveBeenCalled()
	})

	it('POST /api/settings returns 400 with validation details', async () => {
		const response = await settingsPost(
			new NextRequest('http://localhost/api/settings', {
				method: 'POST',
				body: JSON.stringify({ settings: 'bad' })
			})
		)

		expect(response.status).toBe(400)
		const json = await response.json()
		expect(json.error).toBe('Invalid payload')
		expect(json.details.fieldErrors.settings).toBeDefined()
		expect(mockServerDb.upsert).not.toHaveBeenCalled()
	})

	it('POST /api/tasks/sync returns 400 with validation details', async () => {
		const response = await tasksSyncPost(
			new NextRequest('http://localhost/api/tasks/sync', {
				method: 'POST',
				body: JSON.stringify({
					noteId: '',
					tasks: [{ blockId: 'b1', content: 'x', checked: 'no', parentTaskId: null }]
				})
			})
		)

		expect(response.status).toBe(400)
		const json = await response.json()
		expect(json.error).toBe('Invalid payload')
		expect(json.details.fieldErrors.noteId).toBeDefined()
		expect(mockSqlDb.select).not.toHaveBeenCalled()
	})

	it('POST /api/import returns 400 with validation details', async () => {
		const response = await importPost(
			new NextRequest('http://localhost/api/import', {
				method: 'POST',
				body: JSON.stringify({ wrong: 'schema' })
			})
		)

		expect(response.status).toBe(400)
		const json = await response.json()
		expect(json.error).toBe('Invalid payload')
		expect(json.details).toBeDefined()
		expect(mockSqlDb.transaction).not.toHaveBeenCalled()
	})

	it('POST /api/ai/config returns 400 for invalid payload', async () => {
		const response = await aiConfigPost(
			new Request('http://localhost/api/ai/config', {
				method: 'POST',
				body: JSON.stringify({})
			})
		)

		expect(response.status).toBe(400)
		const json = await response.json()
		expect(json.error).toBe('Invalid payload')
		expect(mockSqlDb.select).not.toHaveBeenCalled()
	})
})
