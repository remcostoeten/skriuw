import { clearAuthToken, loadAuthToken, storeAuthToken } from "../bridge/commands";
import { isBrowserRuntime } from "../bridge/runtime";

let token: string | undefined;
let loadPromise: Promise<void> | null = null;

export async function currentSessionToken(): Promise<string | undefined> {
  if (isBrowserRuntime()) return token;
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
  token = value;
  if (!isBrowserRuntime()) await storeAuthToken(value);
}

export async function forgetSessionToken(): Promise<void> {
  token = undefined;
  loadPromise = Promise.resolve();
  if (!isBrowserRuntime()) await clearAuthToken();
}
