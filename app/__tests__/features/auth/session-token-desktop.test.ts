import assert from "node:assert/strict";
import test from "node:test";

type TauriGlobal = typeof globalThis & { window?: Record<string, unknown> };

function installSlowTokenStore(loadDelayMs: number): { stored: string[] } {
  const stored: string[] = [];
  const globals = globalThis as TauriGlobal;
  globals.window = {
    ...(globals.window ?? {}),
    __TAURI_INTERNALS__: {
      invoke: (command: string, args?: { token?: string }) => {
        if (command === "load_auth_token") {
          return new Promise((resolve) => setTimeout(() => resolve(null), loadDelayMs));
        }
        if (command === "store_auth_token") {
          stored.push(args?.token ?? "");
          return Promise.resolve();
        }
        if (command === "clear_auth_token") {
          return Promise.resolve();
        }
        return Promise.reject(new Error(`unexpected command: ${command}`));
      },
      transformCallback: (callback: unknown) => callback,
    },
  };
  return { stored };
}

test("a sign-in during a pending credential load survives the load resolving", async () => {
  const { stored } = installSlowTokenStore(30);
  const sessionToken = await import("../../../src/features/auth/session-token.ts?slow-load");

  const pendingRead = sessionToken.currentSessionToken();
  await sessionToken.rememberSessionToken("token-from-sign-in");
  await pendingRead;
  await new Promise((resolve) => setTimeout(resolve, 60));

  assert.deepEqual(stored, ["token-from-sign-in"]);
  assert.equal(await sessionToken.currentSessionToken(), "token-from-sign-in");
});

test("a sign-out during a pending credential load stays signed out", async () => {
  installSlowTokenStore(30);
  const sessionToken = await import("../../../src/features/auth/session-token.ts?slow-clear");

  await sessionToken.rememberSessionToken("token-from-sign-in");
  const pendingRead = sessionToken.currentSessionToken();
  await sessionToken.forgetSessionToken();
  await pendingRead;

  assert.equal(await sessionToken.currentSessionToken(), undefined);
});
