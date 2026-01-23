'use server'

import { getSession } from "@/lib/api-auth";

type AuthenticatedUser = {
	id: string
	email: string
	name: string | null
}

/**
 * Server action helper that requires authentication.
 * Throws an error if not authenticated - use in server actions.
 * For API routes, use requireAuth from @/lib/api-auth instead.
 */
export async function requireAuth(): Promise<AuthenticatedUser> {
	const session = await getSession()

	if (!session?.user?.id) {
		throw new Error('Authentication required')
	}

	return {
		id: session.user.id,
		email: session.user.email,
		name: session.user.name ?? null
	}
}
