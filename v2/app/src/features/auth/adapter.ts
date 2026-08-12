import type { AuthAdapter } from "@remcostoeten/auth-drawer";
import { createBetterAuthAdapter } from "@remcostoeten/auth-drawer/adapters/better-auth";
import { createAuthClient } from "better-auth/react";
import { noop } from "@/shared/lib/noop";
import { authConfiguration } from "./config";
import { connectSyncForCurrentSession } from "./connect-sync";
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
  let issuedToken: string | null = null;
  // The session atom stays mounted for the app's lifetime because the sign-in
  // drawer never unmounts, so a session read that raced ahead of the stored
  // credential would keep every `useSession()` consumer on its stale value.
  // Signalling once the credential changes refetches it for all of them.
  const client = createAuthClient({
    baseURL,
    fetchOptions: {
      auth: { type: "Bearer", token: currentSessionToken },
      async onSuccess(context) {
        const received = context.response.headers.get("set-auth-token");
        if (!received || received === issuedToken) return;
        issuedToken = received;
        await rememberSessionToken(received);
        client.$store.notify("$sessionSignal");
      },
    },
  });
  const adapter = createBetterAuthAdapter({ client, providers: [], requireName: true });
  // Password reset needs a configured mail delivery path. Do not advertise an
  // action that the v2 cloud service cannot complete yet.
  const { requestPasswordReset: _unsupported, ...supported } = adapter;
  return {
    ...supported,
    // Sync is the only thing an account unlocks, so a successful sign-in turns
    // it on rather than leaving the workspace in a signed-in, local-only state
    // that does nothing. A failure here leaves the status at local-only, which
    // the Account settings row reports with a Resume sync action.
    onSuccess(action) {
      if (action === "signOut") return;
      void connectSyncForCurrentSession().catch(noop);
    },
    async signOut() {
      try {
        return (await supported.signOut?.()) ?? { success: true };
      } finally {
        issuedToken = null;
        await forgetSessionToken();
      }
    },
  };
}

export const authAdapter = authConfiguration.available
  ? configuredAdapter(authConfiguration.baseUrl)
  : unavailableAdapter();
