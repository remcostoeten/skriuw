import { anonymousClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const AUTH_CLIENT_ENABLED = !!process.env.NEXT_PUBLIC_APP_URL

export const authClient = createAuthClient({
	baseURL: process.env.NEXT_PUBLIC_APP_URL,
	plugins: [anonymousClient()]
})

export const { signIn, signUp, useSession, signOut } = authClient
