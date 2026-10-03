import type { UnlistenFn } from "@tauri-apps/api/event";
import { bindAccountLifecycle } from "@/features/auth/account-lifecycle";
import { authConfiguration } from "@/features/auth/config";
import { forgetSessionToken, refreshSessionState } from "@/features/auth/session";
import { listenForSessionExpiry } from "@/features/auth/session-expiry";
import { clearBrowserSessionToken, loadBrowserSessionToken } from "@/features/auth/session-store";
import { startSyncAfterSignIn } from "@/features/sync/connect";
import { clearConnectFailure, connectFailureText } from "@/features/sync/connect-failure";
import { bindBrowserSyncSession } from "@/platform/browser/sync-session";
import { flushPendingWork } from "@/store/pending-work";

function trustedCloudBaseUrl(): string {
  if (!authConfiguration.available) {
    throw new Error(authConfiguration.reason);
  }
  return authConfiguration.baseUrl;
}

/**
 * Wires the account to the rest of the app before anything opens storage: the
 * browser sync driver gets the cloud session it resumes under, and sign-in and
 * sign-out start and stop sync.
 */
export function bindAuthStartup(): void {
  bindBrowserSyncSession({
    baseUrl: trustedCloudBaseUrl,
    persistedToken: loadBrowserSessionToken,
    discardPersistedSession: clearBrowserSessionToken,
    describeFailure: connectFailureText,
  });
  bindAccountLifecycle({
    flushPendingWork,
    signedIn: startSyncAfterSignIn,
    signedOut: clearConnectFailure,
  });
}

/** Forgets the credential once sync learns the cloud session is dead. */
export function listenForExpiredSession(): Promise<UnlistenFn> {
  return listenForSessionExpiry(() => {
    void forgetSessionToken()
      .catch((error) => console.error("expired session credential clear failed", error))
      .finally(refreshSessionState);
  });
}
