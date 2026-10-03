import type { SyncSessionPort } from "@/platform/ports/sync-session";

const signedOut: SyncSessionPort = {
  baseUrl: () => {
    throw new Error("Cloud sync is not configured in this build.");
  },
  persistedToken: () => undefined,
  discardPersistedSession: () => {},
  describeFailure: (error) => (error instanceof Error ? error.message : String(error)),
};

let session: SyncSessionPort = signedOut;

/**
 * @name bindBrowserSyncSession
 * @description Gives the browser sync driver the cloud session it runs under.
 * The application binds it once at startup, before the storage worker opens
 * and resumes a persisted session.
 *
 * @example
 * bindBrowserSyncSession({
 *   baseUrl: () => cloudBaseUrl,
 *   persistedToken: loadBrowserSessionToken,
 *   discardPersistedSession: clearBrowserSessionToken,
 *   describeFailure: connectFailureText,
 * });
 */
export function bindBrowserSyncSession(port: SyncSessionPort): void {
  session = port;
}

export function syncSession(): SyncSessionPort {
  return session;
}
