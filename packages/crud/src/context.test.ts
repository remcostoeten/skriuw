import {
	clearUserContext,
	createScopedContext,
	getCrudUserId,
	getUserContext,
	setUserContext,
	withUser,
	withUserSync
} from './context'
import { afterEach, describe, expect, it } from 'vitest'

const originalWindow = (globalThis as { window?: unknown }).window

function setClientRuntime(): void {
	;(globalThis as { window?: unknown }).window = {}
}

function setServerRuntime(): void {
	delete (globalThis as { window?: unknown }).window
}

afterEach(() => {
	if (originalWindow === undefined) {
		delete (globalThis as { window?: unknown }).window
		return
	}

	;(globalThis as { window?: unknown }).window = originalWindow
})

describe('context (client-only runtime guard)', () => {
	it('supports set/get/clear in a client runtime', () => {
		setClientRuntime()

		setUserContext({ userId: 'user-1' })
		expect(getUserContext()).toEqual({ userId: 'user-1' })
		expect(getCrudUserId()).toBe('user-1')

		clearUserContext()
		expect(getUserContext()).toEqual({})
	})

	it('throws on server runtime for context APIs', async () => {
		setServerRuntime()

		expect(() => setUserContext({ userId: 'server-user' })).toThrow(/client-only/)
		expect(() => getUserContext()).toThrow(/client-only/)
		expect(() => getCrudUserId()).toThrow(/client-only/)
		expect(() => clearUserContext()).toThrow(/client-only/)
		expect(() => withUserSync('u1', () => 'ok')).toThrow(/client-only/)
		await expect(withUser('u1', async () => 'ok')).rejects.toThrow(/client-only/)
		expect(() => createScopedContext({ userId: 'u1' })).toThrow(/client-only/)
	})

	it('prevents async context leakage on server by rejecting concurrent calls', async () => {
		setServerRuntime()

		const result = await Promise.allSettled([
			withUser('u1', async () => 'a'),
			withUser('u2', async () => 'b')
		])

		expect(result[0].status).toBe('rejected')
		expect(result[1].status).toBe('rejected')
	})
})
