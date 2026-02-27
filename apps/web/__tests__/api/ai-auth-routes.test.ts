import { beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test'

const mockRequireAuth = mock()
const mockCheckRateLimit = mock()

mock.module('@/lib/api-auth', () => {
	return {
		requireAuth: mockRequireAuth,
		optionalAuth: mock(),
		withAuth: mock(),
		isAuthenticated: mock(),
		evaluateAuthGuard: mock(),
		allowReadAccess: mock(),
		requireMutation: mock()
	}
})

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
		then: (resolve: any) => resolve(results[resultIndex++] ?? [])
	}

	return chain
}

const mockDb = createChainableMock()

const aiProviderConfig = {
	id: 'ai_provider_config.id',
	userId: 'ai_provider_config.user_id',
	isActive: 'ai_provider_config.is_active',
	provider: 'ai_provider_config.provider',
	model: 'ai_provider_config.model',
	basePrompt: 'ai_provider_config.base_prompt',
	temperature: 'ai_provider_config.temperature'
}

const aiPromptLog = {
	createdAt: 'ai_prompt_log.created_at',
	userId: 'ai_prompt_log.user_id'
}

const aiApiKeys = {
	provider: 'ai_api_keys.provider',
	isActive: 'ai_api_keys.is_active',
	id: 'ai_api_keys.id'
}

mock.module('@skriuw/db', () => {
	return {
		getDatabase: () => mockDb,
		aiProviderConfig,
		aiPromptLog,
		aiApiKeys,
		eq: (a: unknown, b: unknown) => ({ type: 'eq', a, b }),
		and: (...args: unknown[]) => ({ type: 'and', args }),
		default: {}
	}
})

mock.module('drizzle-orm', () => ({
	eq: (a: unknown, b: unknown) => ({ type: 'eq', a, b }),
	and: (...args: unknown[]) => ({ type: 'and', args })
}))

mock.module('@/features/ai/providers', () => ({
	getProvider: () => ({
		sendPrompt: mock(async () => ({ text: 'ok', tokensUsed: 1 }))
	})
}))

mock.module('@/features/ai/utilities', () => ({
	hashPrompt: () => 'hash',
	decryptPrompt: (value: string) => value,
	selectApiKey: () => ({ key: null, reason: 'none' }),
	checkRateLimit: mockCheckRateLimit,
	encryptPrompt: (value: string) => value
}))

mock.module('@/lib/crypto/secret', () => ({
	decryptSecret: (value: string) => value
}))

mock.module('@/lib/env', () => ({
	env: {
		GEMINI_API_KEY: 'test-key',
		GEMINI_BACKUP_KEY: '',
		GROK_API_KEY: '',
		GROK_BACKUP_KEY: ''
	}
}))

let promptPost: typeof import('@/app/api/ai/prompt/route').POST
let configGet: typeof import('@/app/api/ai/config/route').GET
let usageGet: typeof import('@/app/api/ai/usage/route').GET

beforeAll(async () => {
	; ({ POST: promptPost } = await import('@/app/api/ai/prompt/route'))
		; ({ GET: configGet } = await import('@/app/api/ai/config/route'))
		; ({ GET: usageGet } = await import('@/app/api/ai/usage/route'))
})

beforeEach(() => {
	mockRequireAuth.mockReset()
	mockCheckRateLimit.mockReset()
	mockDb._setResults([])
	mockDb.select.mockClear()
	mockDb.from.mockClear()
	mockDb.where.mockClear()
	mockDb.limit.mockClear()
	mockDb.insert.mockClear()
	mockDb.values.mockClear()
	mockDb.update.mockClear()
	mockDb.set.mockClear()
})

describe('AI auth route normalization', () => {
	it('POST /api/ai/prompt returns auth helper response when unauthenticated', async () => {
		mockRequireAuth.mockResolvedValue({
			authenticated: false,
			response: new Response(JSON.stringify({ error: 'Unauthorized' }), {
				status: 401,
				headers: { 'content-type': 'application/json' }
			})
		})

		const response = await promptPost(
			new Request('http://localhost/api/ai/prompt', {
				method: 'POST',
				body: JSON.stringify({ prompt: 'hello' })
			})
		)

		expect(response.status).toBe(401)
		expect(mockRequireAuth).toHaveBeenCalledTimes(1)
		expect(mockDb.select).not.toHaveBeenCalled()
	})

	it('GET /api/ai/config scopes query by authenticated userId', async () => {
		mockRequireAuth.mockResolvedValue({ authenticated: true, userId: 'user-config' })
		mockDb._setResults([[]])

		const response = await configGet()
		expect(response.status).toBe(200)
		expect(await response.json()).toBeNull()
		expect(mockDb.where).toHaveBeenCalledWith({
			type: 'and',
			args: [
				{ type: 'eq', a: aiProviderConfig.userId, b: 'user-config' },
				{ type: 'eq', a: aiProviderConfig.isActive, b: true }
			]
		})
	})

	it('GET /api/ai/usage scopes prompt log query by authenticated userId', async () => {
		mockRequireAuth.mockResolvedValue({ authenticated: true, userId: 'user-usage' })
		mockDb._setResults([[{ createdAt: 1 }, { createdAt: 2 }]])
		mockCheckRateLimit.mockReturnValue({
			allowed: true,
			promptsUsed: 2,
			promptsRemaining: 1,
			resetAt: 123
		})

		const response = await usageGet()
		expect(response.status).toBe(200)
		expect(mockDb.where).toHaveBeenCalledWith({
			type: 'eq',
			a: aiPromptLog.userId,
			b: 'user-usage'
		})
		expect(mockCheckRateLimit).toHaveBeenCalledWith([1, 2])

		const json = await response.json()
		expect(json.promptsUsedToday).toBe(2)
		expect(json.promptsRemaining).toBe(1)
		expect(json.resetAt).toBe(123)
	})
})
