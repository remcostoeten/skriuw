/**
 * @fileoverview Auth Popup Wrapper for Zero-Session Users
 * @description Wraps mutations with Nth-request popup logic
 */

import { shouldShowAuthPopup } from './zero-session-manager'
import { dispatchIdentityRequired } from './identity-guard'

export function withAuthPopup<T extends (...args: any[]) => Promise<any>>(
	fn: T,
	actionName: string
): T {
	return (async (...args: Parameters<T>) => {
		// Check if we should show popup
		if (shouldShowAuthPopup()) {
			dispatchIdentityRequired({ action: actionName })
			throw new Error('Please sign in to save your work')
		}

		// Execute original function
		return await fn(...args)
	}) as T
}

export function wrapWithAuthPopup<
	T extends Record<string, (...args: any[]) => Promise<any>>
>(operations: T, actionPrefix?: string): T {
	const wrapped = {} as T

	for (const [key, fn] of Object.entries(operations)) {
		wrapped[key as keyof T] = withAuthPopup(
			fn as any,
			`${actionPrefix ? `${actionPrefix}:` : ''}${key}`
		) as T[keyof T]
	}

	return wrapped
}
