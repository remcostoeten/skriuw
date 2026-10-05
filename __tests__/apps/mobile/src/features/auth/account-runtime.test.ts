import assert from "node:assert/strict";
import { test } from "vitest";
import { envelope } from "@skriuw/renderer-core/contracts/workspace";
import { createCommitGate } from "@skriuw/renderer-core/store/commit-gate";
import { createInitialState, createRendererStore } from "@skriuw/renderer-core/store/store";
import { createFakeSkriuwCore } from "@/bridge/fake-core";
import { createNativeBridge } from "@/bridge/native-adapter";
import { createAccountRuntime, type AccountRuntime } from "@/features/auth/account-runtime";
import { createKeystore, type SecureStoreModule } from "@/features/auth/keystore";
import { accountSummary, connectionSummary, signInDraftReady } from "@/features/auth/sign-in-model";
import { describeSyncStatus } from "@/features/sync/status";
import { createRemoteChangeReconciler } from "@/features/sync/remote-changes";

const BASE_URL = "https://sync.skriuw.app";
const SESSION_KEY = "skriuw.cloud-session";

type Answer = { status: number; body?: unknown; token?: string };

function fakeSecureStore(): SecureStoreModule & { entries: Map<string, string> } {
  const entries = new Map<string, string>();
  return {
    entries,
    getItemAsync: async (key) => entries.get(key) ?? null,
    setItemAsync: async (key, value) => {
      entries.set(key, value);
    },
    deleteItemAsync: async (key) => {
      entries.delete(key);
    },
  };
}

/** Answers by route, so the order the runtime asks in does not matter. */
function fakeCloud(routes: Record<string, Answer[]>): {
  fetch: typeof globalThis.fetch;
  requested: string[];
} {
  const requested: string[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).slice(BASE_URL.length);
    requested.push(`${init?.method ?? "GET"} ${path}`);
    const answer = routes[path]?.shift() ?? { status: 500 };
    return new Response(answer.body === undefined ? "" : JSON.stringify(answer.body), {
      status: answer.status,
      headers: answer.token === undefined ? {} : { "set-auth-token": answer.token },
    });
  }) as typeof globalThis.fetch;
  return { fetch, requested };
}

function user(): Record<string, unknown> {
  return { user: { id: "user-1", email: "writer@example.com", name: "Writer" } };
}

async function until(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new assert.AssertionError({ message: "condition never held" });
}

function setup(routes: Record<string, Answer[]>) {
  const core = createFakeSkriuwCore();
  const bridge = createNativeBridge(core);
  const secureStore = fakeSecureStore();
  const cloud = fakeCloud(routes);
  const reopened: number[] = [];
  const errors: unknown[] = [];
  const sockets: string[] = [];
  const runtime: AccountRuntime = createAccountRuntime({
    bridge,
    baseUrl: BASE_URL,
    keystore: createKeystore(secureStore),
    fetch: cloud.fetch,
    foreground: { current: () => true, subscribe: () => () => undefined },
    online: { current: () => true, subscribe: () => () => undefined },
    socket: (url) => {
      sockets.push(url);
      return { close: () => undefined };
    },
    timer: { schedule: () => () => undefined },
    reopenWorkspace: async () => {
      await bridge.close();
      reopened.push(reopened.length + 1);
    },
    reportError: (error) => errors.push(error),
  });
  return { core, bridge, secureStore, cloud, runtime, reopened, errors, sockets };
}

test("signing in claims this device's workspace and starts sync in place", async () => {
  const { runtime, secureStore, reopened, bridge, sockets } = setup({
    "/api/auth/sign-in/email": [{ status: 200, body: user(), token: "token-1" }],
    "/v1/sync/state": [{ status: 200, body: { latestServerSequence: 0, workspaceId: "w_mine" } }],
  });
  const stop = runtime.start();

  await runtime.signIn({ email: "writer@example.com", password: "secret" });
  await until(() => runtime.state().account.kind === "signed-in");
  const { account } = runtime.state();

  assert.equal(account.kind, "signed-in");
  assert.equal(account.kind === "signed-in" && account.connection.kind, "connected");
  assert.equal(secureStore.entries.get(SESSION_KEY), "token-1");
  assert.equal(await bridge.activeWorkspaceSlot(), "w_mine");
  assert.deepEqual(reopened, []);
  await until(() => sockets.length > 0);
  assert.equal(sockets[0], "wss://sync.invalid/events");
  stop();
});

test("an account that owns other storage reopens the workspace once, then connects there", async () => {
  const { runtime, bridge, reopened, cloud } = setup({
    "/api/auth/sign-in/email": [{ status: 200, body: user(), token: "token-2" }],
    "/v1/sync/state": [
      { status: 200, body: { latestServerSequence: 4, workspaceId: "w_theirs" } },
      { status: 200, body: { latestServerSequence: 4, workspaceId: "w_theirs" } },
    ],
  });
  await bridge.adoptWorkspaceSlot("w_previous");
  const stop = runtime.start();

  await runtime.signIn({ email: "writer@example.com", password: "secret" });
  await until(() => {
    const { account } = runtime.state();
    return account.kind === "signed-in" && account.connection.kind === "connected";
  });

  assert.deepEqual(reopened, [1]);
  assert.equal(await bridge.activeWorkspaceSlot(), "w_theirs");
  assert.equal(cloud.requested.filter((request) => request === "GET /v1/sync/state").length, 2);
  stop();
});

test("a refused sign-in stays signed out and says why", async () => {
  const { runtime } = setup({ "/api/auth/sign-in/email": [{ status: 401 }] });
  const stop = runtime.start();

  await runtime.signIn({ email: "writer@example.com", password: "wrong" });
  const { account } = runtime.state();

  assert.equal(account.kind, "signed-out");
  assert.equal(account.kind === "signed-out" && account.failure?.code, "invalid-credentials");
  stop();
});

test("an expired session signs the device out and keeps its notes", async () => {
  const { runtime, core, secureStore } = setup({
    "/api/auth/sign-in/email": [{ status: 200, body: user(), token: "token-3" }],
    "/v1/sync/state": [{ status: 200, body: { latestServerSequence: 0, workspaceId: "w_mine" } }],
    "/api/auth/sign-out": [{ status: 401 }],
  });
  const stop = runtime.start();
  await runtime.signIn({ email: "writer@example.com", password: "secret" });
  await until(() => runtime.state().account.kind === "signed-in");

  core.emitSync({ kind: "status", payload: '{"state":"authenticationRequired"}' });
  assert.deepEqual(runtime.state().sync, { state: "authenticationRequired" });
  core.emitSync({ kind: "sessionExpired", payload: null });
  await until(() => runtime.state().account.kind === "signed-out");

  assert.equal(secureStore.entries.has(SESSION_KEY), false);
  assert.deepEqual(runtime.state().sync, { state: "localOnly" });
  stop();
});

test("a stored session is restored and connected at startup", async () => {
  const { runtime, secureStore } = setup({
    "/api/auth/get-session": [{ status: 200, body: user() }],
    "/v1/sync/state": [{ status: 200, body: { latestServerSequence: 0, workspaceId: "w_mine" } }],
  });
  secureStore.entries.set(SESSION_KEY, "stored-token");
  const stop = runtime.start();

  await until(() => {
    const { account } = runtime.state();
    return account.kind === "signed-in" && account.connection.kind === "connected";
  });
  stop();
});

test("remote changes reach the listener the store reconciler subscribes", async () => {
  const { runtime, core } = setup({});
  const stop = runtime.start();
  const changes: string[][] = [];
  const unsubscribe = runtime.onWorkspaceChange((change) => changes.push([...change.noteIds]));

  core.emitSync({
    kind: "workspaceChanged",
    payload: '{"noteIds":["note-1"],"structureChanged":false,"full":false}',
  });
  unsubscribe();
  core.emitSync({ kind: "workspaceChanged", payload: '{"noteIds":[],"full":true}' });

  assert.deepEqual(changes, [["note-1"]]);
  stop();
});

test("a remote structural change re-reads the workspace into the open store", async () => {
  const core = createFakeSkriuwCore();
  const bridge = createNativeBridge(core);
  const store = createRendererStore(createInitialState(await bridge.bootstrapWorkspace(), []));
  const reconciler = createRemoteChangeReconciler({
    store,
    gate: createCommitGate(),
    bootstrap: () => bridge.bootstrapWorkspace(),
    readDelta: (noteIds) => bridge.readWorkspaceDelta(noteIds),
    onError: (error) => {
      throw error;
    },
  });

  await bridge.applyWorkspaceOperations(
    [
      {
        type: "create_note" as const,
        id: "note-remote",
        title: "From another device",
        placement: { parentId: null, position: { type: "last" as const } },
        documentJson: { type: "doc", content: [{ type: "paragraph" }] },
        markdown: "",
        at: 1,
      },
    ].map(envelope),
  );
  assert.equal(store.getState().nodes.has("note-remote"), false);

  reconciler.report({ noteIds: [], structureChanged: true, full: false });
  await reconciler.settled();

  assert.equal(store.getState().nodes.get("note-remote")?.title, "From another device");
  reconciler.dispose();
});

test("the sign-in form and account row read as something a person can act on", () => {
  assert.equal(
    signInDraftReady({ mode: "sign-in", name: "", email: "a@b.co", password: "x" }),
    true,
  );
  assert.equal(
    signInDraftReady({ mode: "sign-up", name: " ", email: "a@b.co", password: "x" }),
    false,
  );
  assert.equal(
    signInDraftReady({ mode: "sign-in", name: "", email: "nobody", password: "x" }),
    false,
  );
  assert.deepEqual(accountSummary({ id: "1", email: "a@b.co", name: null }), {
    title: "a@b.co",
    subtitle: null,
  });

  const paused = describeSyncStatus({ state: "localOnly" });
  assert.equal(
    connectionSummary({ kind: "connected", status: { state: "localOnly" } }, paused).retry,
    true,
  );
  const failed = connectionSummary(
    { kind: "failed", message: "Sync could not start: down" },
    paused,
  );
  assert.deepEqual(failed, {
    summary: "Sync could not start: down",
    detail: null,
    retry: true,
    busy: false,
  });
});
