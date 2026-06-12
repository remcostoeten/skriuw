import { adminClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

const baseURL =
	typeof window !== "undefined"
		? window.location.origin
		: process.env.NEXT_PUBLIC_BETTER_AUTH_URL;

export const authClient = createAuthClient({
	baseURL,
	plugins: [adminClient()],
});

export const { signIn, signUp, signOut, useSession, getSession } = authClient;
