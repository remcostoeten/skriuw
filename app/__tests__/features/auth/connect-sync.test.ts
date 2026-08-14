import assert from "node:assert/strict";
import test from "node:test";

type TauriGlobal = typeof globalThis & { window?: Record<string, unknown> };

const connectCalls: string[] = [];
const stateRequests: Array<{ url: string; authorization: string | null }> = [];
let stateResponse: () => Response = () => cloudStateResponse(0);

function cloudStateResponse(latestServerSequence: number): Response {
  return new Response(
    JSON.stringify({ workspaceId: "w_1", latestServerSequence }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

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

function installCloudStateEndpoint(): void {
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    stateRequests.push({ url, authorization: headers.get("Authorization") });
    return Promise.resolve(stateResponse());
  }) as typeof fetch;
}

installTokenStore();
installCloudStateEndpoint();
const sessionToken = await import("../../../src/features/auth/session-token.ts");
const { connectSyncForCurrentSession } = await import("../../../src/features/auth/connect-sync.ts");

function reset(): void {
  connectCalls.length = 0;
  stateRequests.length = 0;
  stateResponse = () => cloudStateResponse(0);
}

test("a device with a session credential links to its cloud workspace", async () => {
  reset();
  await sessionToken.rememberSessionToken("token-from-sign-in");

  await connectSyncForCurrentSession();

  assert.deepEqual(connectCalls, ["token-from-sign-in"]);
  assert.equal(stateRequests.length, 1);
  assert.ok(stateRequests[0]?.url.endsWith("/v1/sync/state"));
  assert.equal(stateRequests[0]?.authorization, "Bearer token-from-sign-in");
});

test("an account that already holds content still links after the reclaim", async () => {
  reset();
  stateResponse = () => cloudStateResponse(42);
  await sessionToken.rememberSessionToken("token-from-sign-in");

  await connectSyncForCurrentSession();

  assert.deepEqual(connectCalls, ["token-from-sign-in"]);
});

test("a cloud deployment without the state route still links", async () => {
  reset();
  stateResponse = () => new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
  await sessionToken.rememberSessionToken("token-from-sign-in");

  await connectSyncForCurrentSession();

  assert.deepEqual(connectCalls, ["token-from-sign-in"]);
});

test("an unreachable cloud never links, so nothing is pushed or reclaimed", async () => {
  reset();
  stateResponse = () =>
    new Response(JSON.stringify({ error: "sync_service_unavailable" }), { status: 503 });
  await sessionToken.rememberSessionToken("token-from-sign-in");

  await assert.rejects(connectSyncForCurrentSession());

  assert.deepEqual(connectCalls, []);
});

test("an invalid state response never links", async () => {
  reset();
  stateResponse = () =>
    new Response(JSON.stringify({ unexpected: true }), { status: 200 });
  await sessionToken.rememberSessionToken("token-from-sign-in");

  await assert.rejects(connectSyncForCurrentSession());

  assert.deepEqual(connectCalls, []);
});

test("a device without a session credential never attempts to link", async () => {
  reset();
  await sessionToken.forgetSessionToken();

  await connectSyncForCurrentSession();

  assert.deepEqual(connectCalls, []);
  assert.deepEqual(stateRequests, []);
});
