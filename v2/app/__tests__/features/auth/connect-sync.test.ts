import assert from "node:assert/strict";
import test from "node:test";

type TauriGlobal = typeof globalThis & { window?: Record<string, unknown> };

const connectCalls: string[] = [];

function installTokenStore(): void {
  let token: string | null = null;
  const globals = globalThis as TauriGlobal;
  globals.window = {
    ...(globals.window ?? {}),
    __TAURI_INTERNALS__: {
      invoke: (command: string, args?: { token?: string }) => {
        switch (command) {
          case "load_auth_token":
            return Promise.resolve(token);
          case "store_auth_token":
            token = args?.token ?? null;
            return Promise.resolve();
          case "clear_auth_token":
            token = null;
            return Promise.resolve();
          case "connect_workspace_sync":
            connectCalls.push(args?.token ?? "");
            return Promise.resolve({ state: "connecting" });
          default:
            return Promise.reject(new Error(`unexpected command: ${command}`));
        }
      },
      transformCallback: (callback: unknown) => callback,
    },
  };
}

installTokenStore();
const sessionToken = await import("../../../src/features/auth/session-token.ts");
const { connectSyncForCurrentSession } = await import("../../../src/features/auth/connect-sync.ts");

test("a device with a session credential links to its cloud workspace", async () => {
  connectCalls.length = 0;
  await sessionToken.rememberSessionToken("token-from-sign-in");

  await connectSyncForCurrentSession();

  assert.deepEqual(connectCalls, ["token-from-sign-in"]);
});

test("a device without a session credential never attempts to link", async () => {
  connectCalls.length = 0;
  await sessionToken.forgetSessionToken();

  await connectSyncForCurrentSession();

  assert.deepEqual(connectCalls, []);
});
