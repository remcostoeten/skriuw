import { createAuthClient } from 'better-auth/react'
import { anonymousClient } from 'better-auth/client/plugins'
import { getAppUrl } from '@skriuw/env/client'

export const authClient = createAuthClient({
	baseURL: getAppUrl(),
	plugins: [anonymousClient()],
})

export const { signIn, signUp, useSession, signOut } = authClient
