/**
 * @fileoverview API Authentication Utilities
 * @description Provides session helpers for API routes to enable user-scoped operations.
 * Uses Better Auth for session management.
 */

import { headers } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

/**
 * Session result from Better Auth
 */
export interface Session {
	user: {
		id: string
		email: string
		name: string | null
		isAnonymous?: boolean
	}
	session: {
		id: string
		expiresAt: Date
	}
}

/**
 * Authentication result for API routes
 */
export interface AuthResult {
	authenticated: true
	userId: string
	session: Session
}

export interface AuthError {
	authenticated: false
	response: NextResponse
}

// ============================================================================
// SESSION HELPERS
// ============================================================================

/**
 * Gets the current session from the request.
 * Uses Better Auth's getSession API.
 *
 * @returns Session or null if not authenticated
 */
export async function getSession(): Promise<Session | null> {
	try {
		const session = await auth.api.getSession({
			headers: await headers()
		})
		return session as Session | null
	} catch (error) {
		console.error('Failed to get session:', error)
		return null
	}
}

/**
 * Gets the current user ID from the session.
 * Returns null if not authenticated.
 *
 * @returns User ID string or null
 */
export async function getCurrentUserId(): Promise<string | null> {
	const session = await getSession()
	return session?.user?.id ?? null
}

// ============================================================================
// API ROUTE HELPERS
// ============================================================================

/**
 * Requires authentication for an API route.
 * Returns an error response if not authenticated.
 *
 * @returns AuthResult with userId, or AuthError with error response
 *
 * @example
 * ```typescript
 * export async function GET(request: NextRequest) {
 *   const auth = await requireAuth()
 *   if (!auth.authenticated) return auth.response
 *
 *   const { userId } = auth
 *   // userId is guaranteed to be a string here
 * }
 * ```
 */
export async function requireAuth(): Promise<AuthResult | AuthError> {
	const session = await getSession()

	if (!session?.user?.id) {
		return {
			authenticated: false,
			response: NextResponse.json(
				{ error: 'Unauthorized', message: 'Authentication required' },
				{ status: 401 }
			)
		}
	}

	return {
		authenticated: true,
		userId: session.user.id,
		session
	}
}

/**
 * Gets optional authentication for an API route.
 * Returns userId if authenticated, null otherwise.
 * Does not reject unauthenticated requests.
 *
 * @returns User ID string or null
 *
 * @example
 * ```typescript
 * export async function GET(request: NextRequest) {
 *   const userId = await optionalAuth()
 *   // userId may be null for anonymous users
 *   const notes = await db.findAll('notes', userId)
 * }
 * ```
 */
export async function optionalAuth(): Promise<string | null> {
	return getCurrentUserId()
}

// ============================================================================
// MIDDLEWARE WRAPPER
// ============================================================================

/**
 * Wraps an API handler with authentication.
 * Automatically injects userId into the handler.
 *
 * @param handler - The API handler function
 * @param options - Options for authentication behavior
 *
 * @example
 * ```typescript
 * export const GET = withAuth(async (request, { userId }) => {
 *   const notes = await db.findAll('notes', userId)
 *   return NextResponse.json(notes)
 * })
 * ```
 */
export function withAuth<T>(
	handler: (
		request: NextRequest,
		context: { userId: string; session: Session }
	) => Promise<T>,
	options: { required?: boolean } = { required: true }
) {
	return async (request: NextRequest): Promise<T | NextResponse> => {
		const result = options.required
			? await requireAuth()
			: {
					authenticated: true,
					userId: (await optionalAuth()) ?? '',
					session: null as any
				}

		if (!result.authenticated) {
			return (result as AuthError).response
		}

		return handler(request, {
			userId: (result as AuthResult).userId,
			session: (result as AuthResult).session
		})
	}
}

/**
 * Type guard to check if auth result is successful
 */
export function isAuthenticated(
	result: AuthResult | AuthError
): result is AuthResult {
	return result.authenticated
}

// ============================================================================
// GUEST USER SUPPORT
// ============================================================================

/**
 * Guest user ID for anonymous users
 */
export const GUEST_USER_ID = 'guest-user'

// ============================================================================
// PERMISSION HELPERS
// ============================================================================

/**
 * Allows read access for both authenticated and guest users.
 * Returns the user ID (authenticated user ID or guest ID).
 *
 * @returns User ID string (never null)
 *
 * @example
 * ```typescript
 * export async function GET(request: NextRequest) {
 *   const userId = await allowReadAccess()
 *   // userId is guaranteed to be a string (either real user ID or GUEST_USER_ID)
 *   const notes = await db.findAll('notes', userId)
 * }
 * ```
 */
export async function allowReadAccess(): Promise<string> {
	const userId = await getCurrentUserId()
	return userId ?? GUEST_USER_ID
}

/**
 * Requires authentication for mutation operations.
 * Returns an error response if not authenticated.
 * Guest users cannot perform mutations.
 *
 * @returns AuthResult with userId, or AuthError with error response
 *
 * @example
 * ```typescript
 * export async function POST(request: NextRequest) {
 *   const auth = await requireMutation()
 *   if (!auth.authenticated) return auth.response
 *
 *   const { userId } = auth
 *   // userId is guaranteed to be a real user ID (not guest)
 * }
 * ```
 */
export async function requireMutation(): Promise<AuthResult | AuthError> {
	const session = await getSession()

	if (!session?.user?.id || session.user.isAnonymous) {
		return {
			authenticated: false,
			response: NextResponse.json(
				{
					error: 'Unauthorized',
					message: 'Authentication required for mutations'
				},
				{ status: 401 }
			)
		}
	}

	return {
		authenticated: true,
		userId: session.user.id,
		session
	}
}
