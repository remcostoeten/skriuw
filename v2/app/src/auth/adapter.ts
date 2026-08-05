import type { AuthAdapter } from "@remcostoeten/auth-drawer";
import { createBetterAuthAdapter } from "@remcostoeten/auth-drawer/adapters/better-auth";
import { createAuthClient } from "better-auth/react";
import { authConfiguration } from "./config";
import {
  currentSessionToken,
  forgetSessionToken,
  rememberSessionToken,
} from "./session-token";

function unavailableAdapter(): AuthAdapter {
  return {
    id: "skriuw-cloud-unavailable",
    providers: [],
    async signIn() {
      return {
        success: false,
        error: {
          code: "server_error",
          message: "Cloud sign-in is not configured for this build.",
          target: "form",
        },
      };
    },
    useSession() {
      return { data: null, isPending: false, error: null };
    },
  };
}

function configuredAdapter(baseURL: string): AuthAdapter {
  const client = createAuthClient({
    baseURL,
    fetchOptions: {
      auth: { type: "Bearer", token: currentSessionToken },
      async onSuccess(context) {
        const received = context.response.headers.get("set-auth-token");
        if (received) await rememberSessionToken(received);
      },
    },
  });
  const adapter = createBetterAuthAdapter({ client, providers: [], requireName: true });
  // Password reset needs a configured mail delivery path. Do not advertise an
  // action that the v2 cloud service cannot complete yet.
  const { requestPasswordReset: _unsupported, ...supported } = adapter;
  return {
    ...supported,
    async signOut() {
      try {
        return (await supported.signOut?.()) ?? { success: true };
      } finally {
        await forgetSessionToken();
      }
    },
  };
}

export const authAdapter = authConfiguration.available
  ? configuredAdapter(authConfiguration.baseUrl)
  : unavailableAdapter();
