/**
 * Server-side identity guard utilities
 * Use these in server actions and API routes
 */

'use server'

import { headers } from 'next/headers'
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
 * Gets the current session from the request.
 * Uses Better Auth's getSession API.
 */
async function getSession(): Promise<Session | null> {
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
 * Server-side wrapper for mutations that validates identity
 * Use this in server actions to ensure user has proper identity
 */
export async function withServerIdentity<T>(
  operation: () => Promise<T>,
  allowAnonymous: boolean = true
): Promise<T> {
  const session = await getSession()

  const hasSession = !!session?.user
  const isAnonymous = session?.user?.isAnonymous ?? false
  const isAuthenticated = hasSession && !isAnonymous

  // Check if user has required identity
  if (!hasSession || (!allowAnonymous && isAnonymous)) {
    throw new Error('Authentication required')
  }

  // User has proper identity - proceed with operation
  return await operation()
}