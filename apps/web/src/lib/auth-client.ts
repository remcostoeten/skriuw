import { adminClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { getBrowserAppOrigin } from "./app-origin";

const baseURL = getBrowserAppOrigin();

export const authClient = createAuthClient({
	baseURL,
	plugins: [adminClient()],
});

export const { signIn, signUp, signOut, useSession, getSession } = authClient;
