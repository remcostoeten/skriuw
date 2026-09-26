/* eslint-disable react-doctor/unused-export */
/* eslint-disable */
import { adminClient, deviceAuthorizationClient, usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { passkeyClient } from "@better-auth/passkey/client";
import { getBrowserAppOrigin } from "./app-origin";

const baseURL = getBrowserAppOrigin();

export const authClient = createAuthClient({
	baseURL,
	plugins: [adminClient(), usernameClient(), passkeyClient(), deviceAuthorizationClient()],
});

export const { isUsernameAvailable } = authClient;
