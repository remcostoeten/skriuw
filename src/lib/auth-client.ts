import { adminClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// baseURL is optional here; Better Auth can infer the current origin when the
// auth app and client are served from the same domain. Set it explicitly for
// cross-domain deployments.
export const authClient = createAuthClient({
	baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
	plugins: [adminClient()],
});

export const { signIn, signUp, signOut, useSession, getSession } = authClient;
