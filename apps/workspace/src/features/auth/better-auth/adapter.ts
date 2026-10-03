import type { AuthAdapter, AuthResult } from "@remcostoeten/auth-drawer";
import { createBetterAuthAdapter } from "@remcostoeten/auth-drawer/adapters/better-auth";
import { sentinelClient } from "@better-auth/infra/client";
import { createAuthClient } from "better-auth/react";
import { leaveAccountWorkspace } from "@/platform/runtime/commands";
import { showToast } from "@/shared/ui/toast";
import { accountLifecycle } from "../account-lifecycle";
import { authConfiguration } from "../config";
import {
  bindSessionRefresh,
  currentSessionToken,
  forgetSessionToken,
  refreshSessionState,
  rememberSessionToken,
} from "../session";

export const KEYRING_UNAVAILABLE_MESSAGE =
  "Sync will not survive a restart: the system keyring is unavailable";
export const SIGN_OUT_REVOKE_FAILED_MESSAGE =
  "Signed out on this device; the cloud session could not be ended";
export const SIGN_OUT_UNSAVED_MESSAGE =
  "Signed out, but recent edits could not be stored; this window keeps them open";

/**
 * @name signInCallbackPath
 * @description Path Better Auth receives as the sign-in callback URL. It is
 * the page the user signed in from, so anything that follows the callback
 * keeps them there; a path the server would refuse falls back to the root.
 *
 * @example
 * signInCallbackPath("/app/"); // "/app/"
 * signInCallbackPath("//elsewhere.example"); // "/"
 */
export function signInCallbackPath(pathname: string): string {
  // Better Auth's relative callback rule: one leading slash, then path characters only.
  return /^\/(?!\/|\\|%2f|%5c)[\w\-.+/@]*$/i.test(pathname) ? pathname : "/";
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

/**
 * @name leaveSignedOutWorkspace
 * @description Leaves the account's local workspace after sign-out, so a
 * signed-out window never keeps showing it. Edits still in flight are stored
 * first; when they cannot be, the window stays on the account's notes rather
 * than dropping them and `leave` is not called.
 *
 * @example
 * await leaveSignedOutWorkspace(leaveAccountWorkspace);
 */
export async function leaveSignedOutWorkspace(leave: () => Promise<void>): Promise<void> {
  try {
    await accountLifecycle().flushPendingWork();
  } catch (error) {
    console.error("pending work failed before leaving the account workspace", error);
    showToast({ message: SIGN_OUT_UNSAVED_MESSAGE, durationMs: 10_000 });
    return;
  }
  await leave();
}

function configuredAdapter(baseURL: string): AuthAdapter {
  let issuedToken: string | null = null;
  const client = createAuthClient({
    baseURL,
    // Server-side Sentinel answers an abuse verdict with a 423 proof-of-work
    // challenge. Without this the drawer would surface that as an opaque
    // failure the user cannot act on.
    plugins: [sentinelClient({ autoSolveChallenge: true })],
    // The redirect plugin follows the callback URL mid sign-in, unloading the app before sync connects.
    disableDefaultFetchPlugins: true,
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
  bindSessionRefresh(() => client.$store.notify("$sessionSignal"));
  const adapter = createBetterAuthAdapter({
    client,
    providers: [],
    requireName: true,
    callbackURL: signInCallbackPath(globalThis.location?.pathname ?? "/"),
  });
  // Password reset needs a configured mail delivery path. Do not advertise an
  // action that the v2 cloud service cannot complete yet.
  const { requestPasswordReset: _unsupported, ...supported } = adapter;
  return {
    ...supported,
    onSuccess(action) {
      if (action === "signOut") return;
      accountLifecycle().signedIn();
    },
    async signOut() {
      let revoked = false;
      try {
        revoked = await revokeRemoteSession(supported.signOut);
      } finally {
        issuedToken = null;
        accountLifecycle().signedOut();
        await forgetSessionToken();
        refreshSessionState();
      }
      if (!revoked) {
        showToast({ message: SIGN_OUT_REVOKE_FAILED_MESSAGE, durationMs: 10_000 });
      }
      await leaveSignedOutWorkspace(leaveAccountWorkspace);
      return { success: true };
    },
  };
}

export const authAdapter = authConfiguration.available
  ? configuredAdapter(authConfiguration.baseUrl)
  : unavailableAdapter();
