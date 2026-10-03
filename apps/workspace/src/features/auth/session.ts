import { clearAuthToken, loadAuthToken, storeAuthToken } from "@/platform/runtime/commands";
import { isBrowserRuntime } from "@/platform/runtime/runtime";
import {
  clearBrowserSessionToken,
  loadBrowserSessionToken,
  storeBrowserSessionToken,
} from "./session-store";

let refreshSession: (() => void) | null = null;
let token: string | undefined;
let loadPromise: Promise<void> | null = null;
/** A sign-in or sign-out has set the credential, so the stored value is stale. */
let decided = false;

export async function currentSessionToken(): Promise<string | undefined> {
  if (isBrowserRuntime()) return loadBrowserSessionToken();
  loadPromise ??= loadAuthToken()
    .then((stored) => {
      if (decided) return;
      token = stored ?? undefined;
    })
    .catch((error) => {
      console.error("cloud session credential load failed", error);
      if (decided) return;
      token = undefined;
    });
  await loadPromise;
  return token;
}

export type RememberedSession = {
  /** False when the credential lives only in memory for this process. */
  persisted: boolean;
};

/**
 * Adopts a credential for this process and tries to persist it. A vault that
 * refuses the write (no Secret Service, locked keyring) does not undo the
 * sign-in: the in-memory session keeps working and the caller reports that it
 * will not survive a restart.
 */
export async function rememberSessionToken(value: string): Promise<RememberedSession> {
  if (isBrowserRuntime()) {
    return { persisted: storeBrowserSessionToken(value) };
  }
  decided = true;
  token = value;
  try {
    await storeAuthToken(value);
  } catch (error) {
    console.error("cloud session credential persistence failed", error);
    return { persisted: false };
  }
  return { persisted: true };
}

export async function forgetSessionToken(): Promise<void> {
  if (isBrowserRuntime()) {
    clearBrowserSessionToken();
    return;
  }
  decided = true;
  token = undefined;
  loadPromise = Promise.resolve();
  await clearAuthToken();
}

export function bindSessionRefresh(refresh: () => void): void {
  refreshSession = refresh;
}

/**
 * Refetches the session for every `useCloudSession()` consumer. The session
 * atom stays mounted for the app's lifetime because the sign-in drawer never
 * unmounts, so anything that changes the credential outside the client (a
 * remembered token, an expiry the coordinator observed) has to signal it.
 */
export function refreshSessionState(): void {
  refreshSession?.();
}
