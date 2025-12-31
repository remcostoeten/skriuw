'use server'

import { headers } from 'next/headers'
import { auth } from './auth'
import type { Session } from './api-auth'

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

export async function getCurrentUserId(): Promise<string | null> {
	const session = await getSession()
	return session?.user?.id ?? null
}
