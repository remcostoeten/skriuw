import assert from "node:assert/strict";
import test from "node:test";
import {
  createBrowserSyncDriver,
  publishBrowserSyncEvent,
  subscribeBrowserWorkspaceChanges,
  subscribeBrowserSyncProgress,
  SyncSessionRejectedError,
  type BrowserSyncDriverDependencies,
  type BrowserSyncProgress,
  type PushChannelConnection,
} from "../../src/bridge/browser-sync";

type ScheduledTimer = {
  callback: () => void;
  delayMs: number;
  cleared: boolean;
};

type FakePushChannel = {
  connection: PushChannelConnection;
  onWake: () => void;
  closed: boolean;
};

type Harness = {
  driver: ReturnType<typeof createBrowserSyncDriver>;
  timers: ScheduledTimer[];
  requests: { kind: string; payload: unknown }[];
  provisionCalls: { token: string; deviceId: string }[];
  discardedSessions: number[];
  pushChannels: FakePushChannel[];
  respondWith(kind: string, value: unknown): void;
  runDueTimer(): Promise<void>;
};

function createHarness(overrides?: Partial<BrowserSyncDriverDependencies>): Harness {
  const timers: ScheduledTimer[] = [];
  const requests: { kind: string; payload: unknown }[] = [];
  const provisionCalls: { token: string; deviceId: string }[] = [];
  const discardedSessions: number[] = [];
  const pushChannels: FakePushChannel[] = [];
  const responses = new Map<string, unknown>();
  responses.set("sync_connection", null);
  responses.set("sync_connect", { state: "connecting" });
  responses.set("sync_status", { state: "upToDate" });
  responses.set("sync_cycle", {
    status: { state: "upToDate" },
    retryAtMs: null,
    workspaceChanged: false,
  });

  const dependencies: BrowserSyncDriverDependencies = {
    port: {
      request: (kind, payload) => {
        requests.push({ kind, payload });
        if (!responses.has(kind)) {
          return Promise.reject(new Error(`unexpected worker request ${kind}`));
        }
        return Promise.resolve(responses.get(kind));
      },
    },
    baseUrl: () => "http://localhost:8787",
    provision: (token, deviceId) => {
      provisionCalls.push({ token, deviceId });
      return Promise.resolve({ workspaceId: "w_1", deviceId });
    },
    createDeviceId: () => "generated-device",
    now: () => 1_000,
    setTimer: (callback, delayMs) => {
      const timer: ScheduledTimer = { callback, delayMs, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimer: (handle) => {
      (handle as ScheduledTimer).cleared = true;
    },
    persistedToken: () => undefined,
    discardPersistedSession: () => {
      discardedSessions.push(discardedSessions.length + 1);
    },
    openPushChannel: (connection, onWake) => {
      const channel: FakePushChannel = { connection, onWake, closed: false };
      pushChannels.push(channel);
      return () => {
        channel.closed = true;
      };
    },
    ...overrides,
  };
  return {
    driver: createBrowserSyncDriver(dependencies),
    timers,
    requests,
    provisionCalls,
    discardedSessions,
    pushChannels,
    respondWith: (kind, value) => {
      responses.set(kind, value);
    },
    runDueTimer: async () => {
      const due = timers.filter((timer) => !timer.cleared).pop();
      assert.ok(due, "a timer is scheduled");
      due.cleared = true;
      due.callback();
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

test("connect provisions with the durable device identity and starts cycling", async () => {
  const harness = createHarness();
  const status = await harness.driver.connect("token-1");

  assert.deepEqual(status, { state: "connecting" });
  assert.deepEqual(harness.provisionCalls, [{ token: "token-1", deviceId: "generated-device" }]);
  const connect = harness.requests.find((request) => request.kind === "sync_connect");
  assert.deepEqual(connect?.payload, {
    token: "token-1",
    baseUrl: "http://localhost:8787",
    workspaceId: "w_1",
    deviceId: "generated-device",
  });
  assert.equal(harness.timers.filter((timer) => !timer.cleared).length, 1);

  await harness.runDueTimer();
  assert.ok(harness.requests.some((request) => request.kind === "sync_cycle"));
});

test("connect refuses a workspace already linked to a different account", async () => {
  const harness = createHarness();
  harness.respondWith("sync_connection", {
    workspaceId: "w_other",
    deviceId: "device-a",
    observedServerSequence: 4,
  });

  await assert.rejects(
    () => harness.driver.connect("token-1"),
    /linked to another cloud workspace/,
  );
  assert.equal(
    harness.requests.some((request) => request.kind === "sync_connect"),
    false,
  );
});

test("pending cycles reschedule immediately and retrying waits for the deadline", async () => {
  const harness = createHarness();
  await harness.driver.connect("token-1");

  harness.respondWith("sync_cycle", { status: { state: "pending" }, retryAtMs: null });
  await harness.runDueTimer();
  const immediate = harness.timers.filter((timer) => !timer.cleared).pop();
  assert.equal(immediate?.delayMs, 0);

  harness.respondWith("sync_cycle", {
    status: { state: "retrying", nextAttemptAt: 6_000 },
    retryAtMs: 6_000,
  });
  await harness.runDueTimer();
  const delayed = harness.timers.filter((timer) => !timer.cleared).pop();
  assert.equal(delayed?.delayMs, 5_000);
});

test("authenticationRequired stops the scheduler until the next connect", async () => {
  const harness = createHarness();
  await harness.driver.connect("token-1");

  harness.respondWith("sync_cycle", {
    status: { state: "authenticationRequired" },
    retryAtMs: null,
  });
  await harness.runDueTimer();
  assert.equal(harness.timers.filter((timer) => !timer.cleared).length, 0);
  assert.equal(harness.discardedSessions.length, 1);

  harness.driver.notifyLocalCommit();
  assert.equal(harness.timers.filter((timer) => !timer.cleared).length, 0);
});

test("resume reopens sync from a persisted session without interactive sign-in", async () => {
  const harness = createHarness({ persistedToken: () => "persisted-token" });
  harness.respondWith("sync_connection", {
    workspaceId: "w_1",
    deviceId: "device-a",
    observedServerSequence: 4,
  });
  harness.respondWith("sync_connect", { state: "connecting" });

  const status = await harness.driver.resume();

  assert.deepEqual(status, { state: "connecting" });
  assert.deepEqual(harness.provisionCalls, [
    { token: "persisted-token", deviceId: "device-a" },
  ]);
  assert.equal(harness.timers.filter((timer) => !timer.cleared).length, 1);
});

test("resume without a persisted session reports the worker status untouched", async () => {
  const harness = createHarness();
  harness.respondWith("sync_status", { state: "authenticationRequired" });

  const status = await harness.driver.resume();

  assert.deepEqual(status, { state: "authenticationRequired" });
  assert.equal(harness.provisionCalls.length, 0);
  assert.equal(harness.timers.filter((timer) => !timer.cleared).length, 0);
});

test("resume with a never-linked workspace stays local-only", async () => {
  const harness = createHarness({ persistedToken: () => "persisted-token" });
  harness.respondWith("sync_status", { state: "localOnly" });

  const status = await harness.driver.resume();

  assert.deepEqual(status, { state: "localOnly" });
  assert.equal(harness.provisionCalls.length, 0);
});

test("a rejected persisted session is discarded and degrades to authenticationRequired", async () => {
  const harness = createHarness({
    persistedToken: () => "expired-token",
    provision: () =>
      Promise.reject(new SyncSessionRejectedError("your Skriuw session expired; sign in again")),
  });
  harness.respondWith("sync_connection", {
    workspaceId: "w_1",
    deviceId: "device-a",
    observedServerSequence: 4,
  });
  harness.respondWith("sync_status", { state: "authenticationRequired" });

  const status = await harness.driver.resume();

  assert.deepEqual(status, { state: "authenticationRequired" });
  assert.equal(harness.discardedSessions.length, 1);
  assert.equal(harness.timers.filter((timer) => !timer.cleared).length, 0);
});

test("a transient resume failure keeps the persisted session for a later retry", async () => {
  const harness = createHarness({
    persistedToken: () => "still-valid-token",
    provision: () => Promise.reject(new Error("Skriuw cloud is temporarily unavailable")),
  });
  harness.respondWith("sync_connection", {
    workspaceId: "w_1",
    deviceId: "device-a",
    observedServerSequence: 4,
  });
  harness.respondWith("sync_status", { state: "authenticationRequired" });

  const status = await harness.driver.resume();

  assert.deepEqual(status, { state: "authenticationRequired" });
  assert.equal(harness.discardedSessions.length, 0);
});

test("an interactive connect rejected by the server clears the persisted session", async () => {
  const harness = createHarness({
    provision: () =>
      Promise.reject(new SyncSessionRejectedError("your Skriuw session expired; sign in again")),
  });

  await assert.rejects(
    () => harness.driver.connect("expired-token"),
    /session expired/,
  );
  assert.equal(harness.discardedSessions.length, 1);
});

test("local commits coalesce into one scheduled cycle", async () => {
  const harness = createHarness();
  await harness.driver.connect("token-1");

  harness.driver.notifyLocalCommit();
  harness.driver.notifyLocalCommit();
  assert.equal(harness.timers.filter((timer) => !timer.cleared).length, 1);
});

test("a cycle that applies remote state notifies the renderer once", async () => {
  const harness = createHarness();
  let changes = 0;
  const unsubscribe = subscribeBrowserWorkspaceChanges(() => {
    changes += 1;
  });
  await harness.driver.connect("token-1");
  harness.respondWith("sync_cycle", {
    status: { state: "upToDate" },
    retryAtMs: null,
    workspaceChanged: true,
  });

  await harness.runDueTimer();

  unsubscribe();
  assert.equal(changes, 1);
});

test("connect opens the push channel for the provisioned workspace", async () => {
  const harness = createHarness();
  await harness.driver.connect("token-1");

  assert.equal(harness.pushChannels.length, 1);
  assert.deepEqual(harness.pushChannels[0]?.connection, {
    workspaceId: "w_1",
    deviceId: "generated-device",
    token: "token-1",
  });
  assert.equal(harness.pushChannels[0]?.closed, false);
});

test("a push wake schedules an immediate cycle and coalesces while one runs", async () => {
  const harness = createHarness();
  await harness.driver.connect("token-1");

  harness.pushChannels[0]?.onWake();
  harness.pushChannels[0]?.onWake();
  const due = harness.timers.filter((timer) => !timer.cleared);
  assert.equal(due.length, 1);
  assert.equal(due[0]?.delayMs, 0);

  await harness.runDueTimer();
  assert.ok(harness.requests.some((request) => request.kind === "sync_cycle"));
});

test("pause and stop tear the push channel down", async () => {
  const harness = createHarness();
  harness.respondWith("sync_disconnect", { state: "localOnly" });
  await harness.driver.connect("token-1");
  await harness.driver.pause();
  assert.equal(harness.pushChannels[0]?.closed, true);

  await harness.driver.connect("token-2");
  assert.equal(harness.pushChannels.length, 2);
  harness.driver.stop();
  assert.equal(harness.pushChannels[1]?.closed, true);
});

test("authenticationRequired closes the push channel with the session", async () => {
  const harness = createHarness();
  await harness.driver.connect("token-1");

  harness.respondWith("sync_cycle", {
    status: { state: "authenticationRequired" },
    retryAtMs: null,
  });
  await harness.runDueTimer();

  assert.equal(harness.pushChannels[0]?.closed, true);
});

test("reconnecting replaces the previous push channel", async () => {
  const harness = createHarness();
  await harness.driver.connect("token-1");
  await harness.driver.connect("token-2");

  assert.equal(harness.pushChannels.length, 2);
  assert.equal(harness.pushChannels[0]?.closed, true);
  assert.equal(harness.pushChannels[1]?.closed, false);
  assert.equal(harness.pushChannels[1]?.connection.token, "token-2");
});

test("worker progress events reach subscribers and ignore malformed payloads", () => {
  const seen: BrowserSyncProgress[] = [];
  const unsubscribe = subscribeBrowserSyncProgress((progress) => {
    seen.push(progress);
  });

  publishBrowserSyncEvent({ nonsense: true });
  publishBrowserSyncEvent({
    phase: "hydrating",
    transferredChunks: 2,
    transferredBytes: 2_097_152,
    expectedChunks: 8,
    expectedBytes: 8_388_608,
  });
  unsubscribe();

  assert.equal(seen.length, 1);
  assert.equal(seen[0]?.phase, "hydrating");
  assert.equal(seen[0]?.expectedChunks, 8);
});
