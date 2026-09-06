import type { AuthAdapter, AuthResult } from "@remcostoeten/auth-drawer";
import { createBetterAuthAdapter } from "@remcostoeten/auth-drawer/adapters/better-auth";
import { sentinelClient } from "@better-auth/infra/client";
import { createAuthClient } from "better-auth/react";
import { showToast } from "@/shared/ui/toast";
import { authConfiguration } from "./config";
import { connectSyncForCurrentSession } from "./connect-sync";
import { clearConnectFailure, connectFailureText, reportConnectFailure } from "./connect-state";
import {
  currentSessionToken,
  forgetSessionToken,
  rememberSessionToken,
} from "./session-token";

export const KEYRING_UNAVAILABLE_MESSAGE =
  "Sync will not survive a restart: the system keyring is unavailable";
export const SIGN_OUT_REVOKE_FAILED_MESSAGE =
  "Signed out on this device; the cloud session could not be ended";

type SessionSignal = { $store: { notify(key: string): void } };

let sessionClient: SessionSignal | null = null;

/**
 * Refetches the session for every `useSession()` consumer. The session atom
 * stays mounted for the app's lifetime because the sign-in drawer never
 * unmounts, so anything that changes the credential outside the client (a
 * remembered token, an expiry the coordinator observed) has to signal it.
 */
export function refreshSessionState(): void {
  sessionClient?.$store.notify("$sessionSignal");
}

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

async function revokeRemoteSession(
  signOut: (() => Promise<AuthResult>) | undefined,
): Promise<boolean> {
  if (!signOut) return true;
  try {
    return (await signOut()).success;
  } catch (error) {
    console.error("cloud session revoke failed", error);
    return false;
  }
}

function configuredAdapter(baseURL: string): AuthAdapter {
  let issuedToken: string | null = null;
  const client = createAuthClient({
    baseURL,
    // Server-side Sentinel answers an abuse verdict with a 423 proof-of-work
    // challenge. Without this the drawer would surface that as an opaque
    // failure the user cannot act on.
    plugins: [sentinelClient({ autoSolveChallenge: true })],
    fetchOptions: {
      auth: { type: "Bearer", token: currentSessionToken },
      async onSuccess(context) {
        const received = context.response.headers.get("set-auth-token");
        if (!received || received === issuedToken) return;
        issuedToken = received;
        const { persisted } = await rememberSessionToken(received);
        if (!persisted) {
          showToast({ message: KEYRING_UNAVAILABLE_MESSAGE, durationMs: 10_000 });
        }
        refreshSessionState();
      },
    },
  });
  sessionClient = client;
  const adapter = createBetterAuthAdapter({ client, providers: [], requireName: true });
  // Password reset needs a configured mail delivery path. Do not advertise an
  // action that the v2 cloud service cannot complete yet.
  const { requestPasswordReset: _unsupported, ...supported } = adapter;
  return {
    ...supported,
    // Sync is the only thing an account unlocks, so a successful sign-in turns
    // it on rather than leaving the workspace in a signed-in, local-only state
    // that does nothing. A failure here is reported: the Account settings row
    // reads "Sync could not start" with a Resume sync action.
    onSuccess(action) {
      if (action === "signOut") return;
      clearConnectFailure();
      void connectSyncForCurrentSession().then(clearConnectFailure, (error: unknown) => {
        reportConnectFailure(error);
        showToast({
          message: `Sync could not start: ${connectFailureText(error)}`,
          durationMs: 10_000,
        });
      });
    },
    async signOut() {
      let revoked = false;
      try {
        revoked = await revokeRemoteSession(supported.signOut);
      } finally {
        issuedToken = null;
        clearConnectFailure();
        await forgetSessionToken();
        refreshSessionState();
      }
      if (!revoked) {
        showToast({ message: SIGN_OUT_REVOKE_FAILED_MESSAGE, durationMs: 10_000 });
      }
      return { success: true };
    },
  };
}

export const authAdapter = authConfiguration.available
  ? configuredAdapter(authConfiguration.baseUrl)
  : unavailableAdapter();
