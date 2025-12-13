import { describe, it, expect } from 'vitest'
import { evaluateAuthGuard } from '../../lib/api-auth'

describe('requireAuth', () => {
	it('returns 503 when auth is disabled', async () => {
		const result = await evaluateAuthGuard(async () => null, {
			authEnabled: false,
			disabledReason: 'missing secret',
		})

		expect(result.authenticated).toBe(false)
		const body = await result.response.json()
		expect(result.response.status).toBe(503)
		expect(body.error).toMatch(/service unavailable/i)
	})

	it('returns 401 when session is missing', async () => {
		const result = await evaluateAuthGuard(async () => null, {
			authEnabled: true,
		})

		expect(result.authenticated).toBe(false)
		expect(result.response.status).toBe(401)
	})

	it('returns userId when session exists', async () => {
		const userId = 'user-1'
		const result = await evaluateAuthGuard(
			async () => ({
				user: { id: userId, email: 'user@example.com' },
				session: { id: 'session-1', expiresAt: new Date() },
			}),
			{ authEnabled: true }
		)

		expect(result.authenticated).toBe(true)
		expect(result.userId).toBe(userId)
	})
})
