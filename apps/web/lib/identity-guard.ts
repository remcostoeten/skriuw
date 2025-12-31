'use client'

import { useSession } from './auth-client'
import { useCallback, useRef } from 'react'

export interface IdentityState {
	hasIdentity: boolean
	isAuthenticated: boolean
	isAnonymous: boolean
	userId?: string
}

export interface IdentityGuardResult<T = void> {
	success: boolean
	data?: T
	error?: string
	requiresAuth?: boolean
}

export function useIdentityState(): IdentityState {
	const { data: session, isPending } = useSession()

	if (isPending) {
		return {
			hasIdentity: false,
			isAuthenticated: false,
			isAnonymous: false
		}
	}

	const hasSession = !!session?.user
	const isAnonymous = session?.user?.isAnonymous ?? false
	const isAuthenticated = hasSession && !isAnonymous

	return {
		hasIdentity: hasSession,
		isAuthenticated,
		isAnonymous,
		userId: session?.user?.id
	}
}

export interface WithIdentityOptions {
	action?: string
	errorMessage?: string
	showModal?: boolean
}

export function withIdentity<T extends (...args: any[]) => Promise<any>>(
	fn: T,
	options: WithIdentityOptions = {}
): T {
	return (async (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> => {
		const { errorMessage = 'Authentication required' } = options

		try {
			const response = await fetch('/api/auth/check', {
				method: 'GET',
				credentials: 'include'
			})

			if (!response.ok) {
				throw new Error(errorMessage)
			}

			const { hasIdentity } = await response.json()

			if (!hasIdentity) {
				throw new Error(errorMessage)
			}

			return await fn(...args)
		} catch (error) {
			if (error instanceof Error && error.message === errorMessage) {
				throw error
			}
			throw error
		}
	}) as T
}

export type WithIdentityFn<T extends (...args: any[]) => Promise<any>> = (
	...args: Parameters<T>
) => Promise<Awaited<ReturnType<T>>>

export function createIdentityGuard<T extends (...args: any[]) => Promise<any>>(
	fn: T,
	options?: WithIdentityOptions
): WithIdentityFn<T> {
	return withIdentity(fn, options)
}

export function useWithIdentity() {
	const identity = useIdentityState()

	return useCallback(
		<T extends (...args: any[]) => Promise<any>>(
			fn: T,
			options: WithIdentityOptions = {}
		): ((...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>>) => {
			return async (
				...args: Parameters<T>
			): Promise<Awaited<ReturnType<T>>> => {
				const { errorMessage = 'Authentication required' } = options

				if (!identity.hasIdentity) {
					throw new Error(errorMessage)
				}

				try {
					return await fn(...args)
				} catch (error) {
					if (
						error instanceof Error &&
						(error.message.includes('Authentication required') ||
							error.message.includes('Session not found'))
					) {
						throw error
					}
					throw error
				}
			}
		},
		[identity.hasIdentity]
	)
}

export function createCrudGuard<
	T extends Record<string, (...args: any[]) => Promise<any>>
>(operations: T, defaultOptions: WithIdentityOptions = {}): T {
	const wrapped = {} as T

	for (const [key, fn] of Object.entries(operations)) {
		wrapped[key as keyof T] = withIdentity(fn, {
			action: key,
			...defaultOptions
		}) as T[keyof T]
	}

	return wrapped
}

export function isIdentityError(error: unknown): boolean {
	return (
		error instanceof Error &&
		(error.message.includes('Authentication required') ||
			error.message.includes('Session not found') ||
			error.message.includes('Unauthorized'))
	)
}
