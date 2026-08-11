import { clearAuthToken, loadAuthToken, storeAuthToken } from "@/bridge/commands";
import { isBrowserRuntime } from "@/bridge/runtime";
import {
  clearBrowserSessionToken,
  loadBrowserSessionToken,
  storeBrowserSessionToken,
} from "./session-store";

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

export async function rememberSessionToken(value: string): Promise<void> {
  if (isBrowserRuntime()) {
    storeBrowserSessionToken(value);
    return;
  }
  decided = true;
  token = value;
  await storeAuthToken(value);
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
