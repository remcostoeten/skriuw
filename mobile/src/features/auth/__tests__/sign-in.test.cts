import assert from "node:assert/strict";
import test from "node:test";
import { createAccountController, KEYSTORE_NOT_PERSISTED_MESSAGE } from "../account";
import type { AccountView } from "../account";
import { createAuthClient } from "../client";
import type { AuthClient } from "../client";
import { PRODUCTION_CLOUD_URL, resolveCloudConfiguration } from "../cloud-configuration";
import { connectSyncForCurrentSession } from "../connect";
import type { ConnectOutcome } from "../connect";
import {
  createKeystore,
  createUnavailableKeystore,
  KEYSTORE_UNAVAILABLE_MESSAGE,
} from "../keystore";
import type { SecureStoreModule } from "../keystore";
import { createSessionStore } from "../session";

const BASE_URL = "https://sync.skriuw.app";

type Exchange = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
};

type Answer = {
  status: number;
  body?: unknown;
  token?: string;
};

/** A keystore backed by a plain map, standing in for the platform one. */
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

function fakeFetch(answers: Answer[]): {
  fetch: typeof globalThis.fetch;
  exchanges: Exchange[];
} {
  const exchanges: Exchange[] = [];
  const queued = [...answers];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = init?.headers as Record<string, string> | undefined;
    exchanges.push({
      url: String(input),
      method: init?.method ?? "GET",
      headers: headers ?? {},
      body: typeof init?.body === "string" ? init.body : null,
    });
    const answer = queued.shift() ?? { status: 500 };
    return new Response(answer.body === undefined ? "" : JSON.stringify(answer.body), {
      status: answer.status,
      headers: answer.token === undefined ? {} : { "set-auth-token": answer.token },
    });
  }) as typeof globalThis.fetch;
  return { fetch, exchanges };
}

function account(id = "user-1"): Record<string, unknown> {
  return { user: { id, email: "writer@example.com", name: "Writer" } };
}

test("only Skriuw origins are accepted as the cloud this build signs in to", () => {
  assert.deepEqual(resolveCloudConfiguration({}), {
    available: true,
    baseUrl: PRODUCTION_CLOUD_URL,
  });
  assert.deepEqual(resolveCloudConfiguration({ cloudUrl: "https://sync.skriuw.app/" }), {
    available: true,
    baseUrl: "https://sync.skriuw.app",
  });
  assert.equal(resolveCloudConfiguration({ cloudUrl: "https://evil.example" }).available, false);
  assert.equal(
    resolveCloudConfiguration({ cloudUrl: "https://skriuw.app.evil.example" }).available,
    false,
  );
  assert.equal(resolveCloudConfiguration({ cloudUrl: "http://sync.skriuw.app" }).available, false);
});

test("a development build reaches a local Worker, a release build does not", () => {
  const local = { cloudUrl: "http://10.0.2.2:8787" };
  assert.deepEqual(resolveCloudConfiguration({ ...local, development: true }), {
    available: true,
    baseUrl: "http://10.0.2.2:8787",
  });
  assert.equal(resolveCloudConfiguration(local).available, false);
  assert.equal(
    resolveCloudConfiguration({ cloudUrl: "http://localhost.evil.example", development: true })
      .available,
    false,
  );
});

test("the credential goes to the platform keystore and nowhere else", async () => {
  const secureStore = fakeSecureStore();
  const session = createSessionStore(createKeystore(secureStore));

  assert.equal(await session.current(), null);
  assert.deepEqual(await session.remember("session-token"), { persisted: true });
  assert.equal(await session.current(), "session-token");
  assert.deepEqual([...secureStore.entries.values()], ["session-token"]);

  await session.forget();
  assert.equal(await session.current(), null);
  assert.equal(secureStore.entries.size, 0);
});

test("a build without a keystore refuses rather than falling back to plain storage", async () => {
  const keystore = createUnavailableKeystore();
  await assert.rejects(keystore.read("skriuw.cloud-session"), {
    message: KEYSTORE_UNAVAILABLE_MESSAGE,
  });

  const errors: unknown[] = [];
  const session = createSessionStore(keystore, { reportError: (error) => errors.push(error) });
  assert.equal(await session.current(), null);
  assert.deepEqual(await session.remember("session-token"), { persisted: false });
  // The sign-in still holds for this process: refusing to persist must not
  // also refuse to work.
  assert.equal(await session.current(), "session-token");
  assert.equal(errors.length, 2);
});

test("signing in reads the bearer header and stores what it received", async () => {
  const secureStore = fakeSecureStore();
  const session = createSessionStore(createKeystore(secureStore));
  const { fetch, exchanges } = fakeFetch([
    { status: 200, body: account(), token: "issued-token" },
  ]);
  const client = createAuthClient({ baseUrl: BASE_URL, session, fetch });

  const result = await client.signIn({ email: "writer@example.com", password: "correct horse" });
  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.value.account, {
    id: "user-1",
    email: "writer@example.com",
    name: "Writer",
  });
  assert.equal(result.ok && result.value.persisted, true);
  assert.equal(await session.current(), "issued-token");

  const [exchange] = exchanges;
  assert.equal(exchange?.url, `${BASE_URL}/api/auth/sign-in/email`);
  assert.equal(exchange?.method, "POST");
  assert.equal(exchange?.body, JSON.stringify({ email: "writer@example.com", password: "correct horse" }));
});

test("a sign-in without a credential in the answer is not treated as signed in", async () => {
  const session = createSessionStore(createKeystore(fakeSecureStore()));
  const { fetch } = fakeFetch([{ status: 200, body: account() }]);
  const client = createAuthClient({ baseUrl: BASE_URL, session, fetch });

  const result = await client.signIn({ email: "writer@example.com", password: "secret" });
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.error.code, "invalid-response");
  assert.equal(await session.current(), null);
});

test("each refusal the Worker can return is actionable rather than opaque", async () => {
  const cases: Array<[number, string]> = [
    [401, "invalid-credentials"],
    [403, "invalid-credentials"],
    [409, "already-registered"],
    [423, "challenge-required"],
    [429, "rate-limited"],
    [503, "unavailable"],
  ];
  for (const [status, code] of cases) {
    const session = createSessionStore(createKeystore(fakeSecureStore()));
    const { fetch } = fakeFetch([{ status, body: { message: "provider prose" } }]);
    const client = createAuthClient({ baseUrl: BASE_URL, session, fetch });
    const result = await client.signIn({ email: "writer@example.com", password: "secret" });

    assert.equal(result.ok, false, `status ${status} must fail`);
    assert.equal(!result.ok && result.error.code, code);
    // Provider text never reaches the user.
    assert.ok(!result.ok && !result.error.message.includes("provider prose"));
  }
});

test("a cloud that cannot be reached is a network failure, not a wrong password", async () => {
  const session = createSessionStore(createKeystore(fakeSecureStore()));
  const fetch = (async () => {
    throw new TypeError("Network request failed");
  }) as typeof globalThis.fetch;
  const client = createAuthClient({ baseUrl: BASE_URL, session, fetch });

  const result = await client.signIn({ email: "writer@example.com", password: "secret" });
  assert.equal(!result.ok && result.error.code, "network");
});

test("a credential the cloud no longer honours leaves the device signed out", async () => {
  const secureStore = fakeSecureStore();
  const session = createSessionStore(createKeystore(secureStore));
  await session.remember("expired-token");
  const { fetch } = fakeFetch([{ status: 401 }]);
  const client = createAuthClient({ baseUrl: BASE_URL, session, fetch });

  const result = await client.currentAccount();
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.value, null);
  assert.equal(await session.current(), null);
  assert.equal(secureStore.entries.size, 0);
});

test("signing out clears the credential even when the revoke fails", async () => {
  const secureStore = fakeSecureStore();
  const session = createSessionStore(createKeystore(secureStore));
  await session.remember("session-token");
  const { fetch } = fakeFetch([{ status: 500 }]);
  const client = createAuthClient({ baseUrl: BASE_URL, session, fetch });

  const result = await client.signOut();
  assert.equal(result.ok && result.value.revoked, false);
  assert.equal(await session.current(), null);
  assert.equal(secureStore.entries.size, 0);
});

test("an account that owns other storage is routed before anything connects", async () => {
  const session = createSessionStore(createKeystore(fakeSecureStore()));
  await session.remember("session-token");
  const { fetch, exchanges } = fakeFetch([
    { status: 200, body: { latestServerSequence: 12, workspaceId: "w_other" } },
  ]);
  const connected: string[] = [];

  const outcome = await connectSyncForCurrentSession({
    baseUrl: BASE_URL,
    session,
    fetch,
    bridge: {
      adoptWorkspaceSlot: async () => "switched",
      connectWorkspaceSync: async (token) => {
        connected.push(token);
        return { state: "upToDate" };
      },
    },
  });

  assert.deepEqual(outcome, { kind: "reopen-required", workspaceId: "w_other" });
  assert.deepEqual(connected, [], "sync must not connect against a workspace being left");
  assert.equal(exchanges[0]?.url, `${BASE_URL}/v1/sync/state`);
});

test("an account that owns this storage claims it and connects in place", async () => {
  const session = createSessionStore(createKeystore(fakeSecureStore()));
  await session.remember("session-token");
  const { fetch } = fakeFetch([
    { status: 200, body: { latestServerSequence: 0, workspaceId: "w_mine" } },
  ]);
  const adopted: string[] = [];

  const outcome = await connectSyncForCurrentSession({
    baseUrl: BASE_URL,
    session,
    fetch,
    bridge: {
      adoptWorkspaceSlot: async (workspaceId) => {
        adopted.push(workspaceId);
        return "claimed";
      },
      connectWorkspaceSync: async () => ({ state: "connecting" }),
    },
  });

  assert.deepEqual(adopted, ["w_mine"]);
  assert.deepEqual(outcome, {
    kind: "connected",
    status: { state: "connecting" },
    workspaceId: "w_mine",
  });
});

test("a cloud that cannot name a workspace still connects, and one that errors does not", async () => {
  const session = createSessionStore(createKeystore(fakeSecureStore()));
  await session.remember("session-token");

  const legacy = await connectSyncForCurrentSession({
    baseUrl: BASE_URL,
    session,
    fetch: fakeFetch([{ status: 404 }]).fetch,
    bridge: {
      adoptWorkspaceSlot: async () => {
        throw new Error("routing must not run without a workspace identity");
      },
      connectWorkspaceSync: async () => ({ state: "upToDate" }),
    },
  });
  assert.equal(legacy.kind, "connected");

  await assert.rejects(
    connectSyncForCurrentSession({
      baseUrl: BASE_URL,
      session,
      fetch: fakeFetch([{ status: 500 }]).fetch,
      bridge: {
        adoptWorkspaceSlot: async () => "active",
        connectWorkspaceSync: async () => {
          throw new Error("sync must not connect against an unknown workspace");
        },
      },
    }),
    /the cloud workspace state request failed: 500/,
  );
});

function stubClient(overrides: Partial<AuthClient> = {}): AuthClient {
  return {
    signIn: async () => ({
      ok: true,
      value: { account: { id: "user-1", email: "writer@example.com", name: null }, persisted: true },
    }),
    signUp: async () => ({
      ok: true,
      value: { account: { id: "user-1", email: "writer@example.com", name: null }, persisted: true },
    }),
    currentAccount: async () => ({ ok: true, value: null }),
    signOut: async () => ({ ok: true, value: { revoked: true } }),
    ...overrides,
  };
}

function controllerViews(
  connect: () => Promise<ConnectOutcome>,
  client: AuthClient = stubClient(),
  pause: () => Promise<void> = async () => undefined,
): { views: AccountView[]; controller: ReturnType<typeof createAccountController> } {
  const views: AccountView[] = [];
  const controller = createAccountController({
    client,
    connect,
    pause,
    onChange: (view) => views.push(view),
  });
  return { views, controller };
}

test("a successful sign-in turns sync on rather than leaving it off", async () => {
  const { views, controller } = controllerViews(async () => ({
    kind: "connected",
    status: { state: "upToDate" },
    workspaceId: "w_mine",
  }));

  await controller.signIn({ email: "writer@example.com", password: "secret" });

  assert.deepEqual(
    views.map((view) => view.kind),
    ["signed-out", "signed-in", "signed-in"],
  );
  const final = controller.view();
  assert.equal(final.kind, "signed-in");
  assert.deepEqual(final.kind === "signed-in" && final.connection, {
    kind: "connected",
    status: { state: "upToDate" },
  });
  assert.equal(final.kind === "signed-in" && final.warning, null);
});

test("a sign-in that connects against other storage asks the shell to reopen", async () => {
  const { controller } = controllerViews(async () => ({
    kind: "reopen-required",
    workspaceId: "w_other",
  }));

  await controller.signIn({ email: "writer@example.com", password: "secret" });

  const view = controller.view();
  assert.deepEqual(view.kind === "signed-in" && view.connection, {
    kind: "reopen-required",
    workspaceId: "w_other",
  });
});

test("sync failing after a valid sign-in stays signed in and offers a retry", async () => {
  let attempt = 0;
  const { controller } = controllerViews(async () => {
    attempt += 1;
    if (attempt === 1) throw new Error("cloud unreachable");
    return { kind: "connected", status: { state: "upToDate" }, workspaceId: null };
  });

  await controller.signIn({ email: "writer@example.com", password: "secret" });
  const failed = controller.view();
  assert.equal(failed.kind, "signed-in");
  assert.equal(
    failed.kind === "signed-in" && failed.connection.kind === "failed"
      ? failed.connection.message
      : null,
    "Sync could not start: cloud unreachable",
  );

  // The retry must not ask for the password again.
  await controller.retryConnection();
  assert.equal(
    controller.view().kind === "signed-in" &&
      (controller.view() as { connection: { kind: string } }).connection.kind,
    "connected",
  );
});

test("a credential that could not be stored is a warning, not a failed sign-in", async () => {
  const { controller } = controllerViews(
    async () => ({ kind: "connected", status: { state: "upToDate" }, workspaceId: null }),
    stubClient({
      signIn: async () => ({
        ok: true,
        value: {
          account: { id: "user-1", email: "writer@example.com", name: null },
          persisted: false,
        },
      }),
    }),
  );

  await controller.signIn({ email: "writer@example.com", password: "secret" });

  const view = controller.view();
  assert.equal(view.kind === "signed-in" && view.warning, KEYSTORE_NOT_PERSISTED_MESSAGE);
  assert.equal(view.kind === "signed-in" && view.connection.kind, "connected");
});

test("a rejected sign-in reports the refusal and leaves the device signed out", async () => {
  const { controller } = controllerViews(
    async () => {
      throw new Error("sync must not start without a credential");
    },
    stubClient({
      signIn: async () => ({
        ok: false,
        error: { code: "invalid-credentials", message: "That email and password do not match an account." },
      }),
    }),
  );

  await controller.signIn({ email: "writer@example.com", password: "wrong" });

  const view = controller.view();
  assert.equal(view.kind, "signed-out");
  assert.equal(view.kind === "signed-out" && view.failure?.code, "invalid-credentials");
});

test("signing out pauses sync and clears the account even when pausing fails", async () => {
  let paused = 0;
  const { controller } = controllerViews(
    async () => ({ kind: "connected", status: { state: "upToDate" }, workspaceId: null }),
    stubClient(),
    async () => {
      paused += 1;
      throw new Error("the native core is already closed");
    },
  );

  await controller.signIn({ email: "writer@example.com", password: "secret" });
  await controller.signOut();

  assert.equal(paused, 1);
  assert.deepEqual(controller.view(), { kind: "signed-out", failure: null, busy: false });
});

test("restoring at startup connects a stored session and stays quiet without one", async () => {
  const { controller: withSession } = controllerViews(
    async () => ({ kind: "connected", status: { state: "pending" }, workspaceId: null }),
    stubClient({
      currentAccount: async () => ({
        ok: true,
        value: { id: "user-1", email: "writer@example.com", name: null },
      }),
    }),
  );
  await withSession.restore();
  assert.equal(withSession.view().kind, "signed-in");

  const { controller: withoutSession, views } = controllerViews(async () => {
    throw new Error("sync must not start for a signed-out device");
  });
  await withoutSession.restore();
  assert.deepEqual(views, [{ kind: "signed-out", failure: null, busy: false }]);
});
