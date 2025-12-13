import { createAuthClient } from 'better-auth/react'
import { anonymousClient } from 'better-auth/client/plugins'
import { env } from '@skriuw/env/server'

const AUTH_CLIENT_ENABLED = Boolean(env.NEXT_PUBLIC_APP_URL)

function createDisabledAuthClient() {
	const error = new Error(
		'Authentication disabled (missing NEXT_PUBLIC_APP_URL)'
	)
	return {
		signIn: {
			email: () => Promise.reject(error),
			social: () => Promise.reject(error),
			anonymous: () => Promise.reject(error)
		},
		signUp: {
			email: () => Promise.reject(error)
		},
		signOut: () => Promise.resolve(),
		useSession: () => ({
			data: null,
			isPending: false,
			isRefetching: false,
			error,
			refetch: async () => {}
		})
	}
}

export const authClient = AUTH_CLIENT_ENABLED
	? createAuthClient({
			baseURL: env.NEXT_PUBLIC_APP_URL,
			plugins: [anonymousClient()]
		})
	: createDisabledAuthClient()

export const { signIn, signUp, useSession, signOut } = authClient
export { AUTH_CLIENT_ENABLED }
