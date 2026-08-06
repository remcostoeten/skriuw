import { clearAuthToken, loadAuthToken, storeAuthToken } from "../bridge/commands";
import { isBrowserRuntime } from "../bridge/runtime";
import {
  clearBrowserSessionToken,
  loadBrowserSessionToken,
  storeBrowserSessionToken,
} from "./session-store";

let token: string | undefined;
let loadPromise: Promise<void> | null = null;

export async function currentSessionToken(): Promise<string | undefined> {
  if (isBrowserRuntime()) return loadBrowserSessionToken();
  loadPromise ??= loadAuthToken()
    .then((stored) => {
      token = stored ?? undefined;
    })
    .catch((error) => {
      console.error("cloud session credential load failed", error);
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
  token = value;
  await storeAuthToken(value);
}

export async function forgetSessionToken(): Promise<void> {
  if (isBrowserRuntime()) {
    clearBrowserSessionToken();
    return;
  }
  token = undefined;
  loadPromise = Promise.resolve();
  await clearAuthToken();
}
