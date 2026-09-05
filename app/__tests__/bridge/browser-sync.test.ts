import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyDriverFailure,
  createBrowserSyncDriver,
  DRIVER_FAILURE_AFTER_RECONNECTS,
  OFFLINE_PROBE_MS,
  POLL_CHANNEL_CONNECTED_MS,
  POLL_HIDDEN_MS,
  POLL_VISIBLE_FOCUSED_MS,
  POLL_VISIBLE_UNFOCUSED_MS,
  pollIntervalMs,
  publishBrowserSyncEvent,
  subscribeBrowserSessionExpired,
  subscribeBrowserWorkspaceChanges,
  subscribeBrowserSyncProgress,
  SyncSessionRejectedError,
  type BrowserSyncChange,
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
  onChannelState: (connected: boolean) => void;
  closed: boolean;
};

type Harness = {
  driver: ReturnType<typeof createBrowserSyncDriver>;
  timers: ScheduledTimer[];
  requests: { kind: string; payload: unknown }[];
  provisionCalls: { token: string; deviceId: string }[];
  discardedSessions: number[];
  pushChannels: FakePushChannel[];
  clock: { now: number };
  respondWith(kind: string, value: unknown): void;
  failWith(kind: string, error: unknown): void;
  runDueTimer(): Promise<void>;
  dueTimers(): ScheduledTimer[];
};

function createHarness(overrides?: Partial<BrowserSyncDriverDependencies>): Harness {
  const timers: ScheduledTimer[] = [];
  const requests: { kind: string; payload: unknown }[] = [];
  const provisionCalls: { token: string; deviceId: string }[] = [];
  const discardedSessions: number[] = [];
  const pushChannels: FakePushChannel[] = [];
  const responses = new Map<string, unknown>();
  const failures = new Map<string, unknown>();
  const clock = { now: 1_000 };
  responses.set("sync_connection", null);
  responses.set("sync_connect", { state: "connecting" });
  responses.set("sync_status", { state: "upToDate" });
  responses.set("sync_refresh", undefined);
  responses.set("sync_interrupt", undefined);
  responses.set("sync_cycle", {
    status: { state: "upToDate" },
    retryAtMs: null,
    changes: { noteIds: [], structureChanged: false, full: false },
  });

  const dependencies: BrowserSyncDriverDependencies = {
    port: {
      request: (kind, payload) => {
        requests.push({ kind, payload });
        if (failures.has(kind)) {
          return Promise.reject(failures.get(kind));
        }
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
    now: () => clock.now,
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
    openPushChannel: (connection, onWake, onChannelState) => {
      const channel: FakePushChannel = { connection, onWake, onChannelState, closed: false };
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
    clock,
    respondWith: (kind, value) => {
      failures.delete(kind);
      responses.set(kind, value);
    },
    failWith: (kind, error) => {
      failures.set(kind, error);
    },
    runDueTimer: async () => {
      const due = timers.filter((timer) => !timer.cleared).pop();
      assert.ok(due, "a timer is scheduled");
      due.cleared = true;
      due.callback();
      for (let index = 0; index < 4; index += 1) await Promise.resolve();
    },
    dueTimers: () => timers.filter((timer) => !timer.cleared),
  };
}

function lastDelay(harness: Harness): number | undefined {
  return harness.dueTimers().pop()?.delayMs;
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
    changes: { noteIds: ["n-1"], structureChanged: false, full: false },
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
    baseUrl: "http://localhost:8787",
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

test("the change payload reaches listeners and empty reports stay silent", async () => {
  const harness = createHarness();
  const seen: BrowserSyncChange[] = [];
  const unsubscribe = subscribeBrowserWorkspaceChanges((change) => {
    seen.push(change);
  });
  await harness.driver.connect("token-1");
  await harness.runDueTimer();
  harness.respondWith("sync_cycle", {
    status: { state: "upToDate" },
    retryAtMs: null,
    changes: { noteIds: ["n-1", "n-2"], structureChanged: true, full: false },
  });
  await harness.runDueTimer();
  unsubscribe();

  assert.deepEqual(seen, [{ noteIds: ["n-1", "n-2"], structureChanged: true, full: false }]);
});

test("a transient cycle failure backs off from one second and doubles to a minute", async () => {
  const harness = createHarness();
  await harness.driver.connect("token-1");
  harness.failWith("sync_cycle", { code: "backend", message: "busy", recovery: "", terminal: false });

  const delays: number[] = [];
  for (let index = 0; index < 8; index += 1) {
    await harness.runDueTimer();
    delays.push(lastDelay(harness) ?? -1);
  }
  assert.deepEqual(delays, [1_000, 2_000, 4_000, 8_000, 16_000, 32_000, 60_000, 60_000]);
  assert.equal(harness.pushChannels[0]?.closed, false, "the session stays active");

  harness.respondWith("sync_cycle", {
    status: { state: "upToDate" },
    retryAtMs: null,
    changes: { noteIds: [], structureChanged: false, full: false },
  });
  await harness.runDueTimer();
  assert.deepEqual(await harness.driver.status(), { state: "upToDate" });
});

test("status overlays retrying after two consecutive failures", async () => {
  const harness = createHarness();
  await harness.driver.connect("token-1");
  harness.failWith("sync_cycle", new Error("worker hiccup"));

  await harness.runDueTimer();
  assert.deepEqual(await harness.driver.status(), { state: "upToDate" });
  await harness.runDueTimer();
  assert.deepEqual(await harness.driver.status(), {
    state: "retrying",
    nextAttemptAt: 1_000 + 2_000,
  });
});

test("a terminal failure drops the session and re-establishes it from the persisted token on the next wake", async () => {
  const harness = createHarness({ persistedToken: () => "persisted-token" });
  await harness.driver.connect("token-1");
  harness.failWith("sync_cycle", {
    code: "worker_crashed",
    message: "The browser storage worker crashed.",
    recovery: "",
    terminal: true,
  });
  await harness.runDueTimer();

  assert.equal(harness.dueTimers().length, 0, "nothing is scheduled on a lost session");
  assert.equal(harness.pushChannels[0]?.closed, true);
  assert.equal(harness.discardedSessions.length, 0, "the persisted session is kept");

  harness.respondWith("sync_connection", {
    workspaceId: "w_1",
    deviceId: "generated-device",
    observedServerSequence: 4,
  });
  harness.respondWith("sync_cycle", {
    status: { state: "upToDate" },
    retryAtMs: null,
    changes: { noteIds: [], structureChanged: false, full: false },
  });
  harness.driver.wake();
  for (let index = 0; index < 8; index += 1) await Promise.resolve();

  assert.equal(harness.provisionCalls.length, 2);
  assert.equal(harness.provisionCalls[1]?.token, "persisted-token");
  assert.equal(harness.pushChannels.length, 2);
  assert.equal(harness.dueTimers().length, 1);
});

test("five failed reconnects surface as a driver failure block", async () => {
  const harness = createHarness({
    persistedToken: () => "persisted-token",
  });
  await harness.driver.connect("token-1");
  harness.failWith("sync_cycle", { code: "timed_out", message: "", recovery: "", terminal: true });
  await harness.runDueTimer();
  harness.respondWith("sync_connection", {
    workspaceId: "w_1",
    deviceId: "generated-device",
    observedServerSequence: 4,
  });
  harness.failWith("sync_connect", { code: "worker_crashed", message: "", recovery: "", terminal: true });

  for (let attempt = 0; attempt < DRIVER_FAILURE_AFTER_RECONNECTS; attempt += 1) {
    harness.driver.wake();
    for (let index = 0; index < 24; index += 1) await Promise.resolve();
  }
  assert.equal(
    harness.requests.filter((request) => request.kind === "sync_connect").length,
    DRIVER_FAILURE_AFTER_RECONNECTS + 1,
    "every wake after a lost session retries the reconnect",
  );

  const status = await harness.driver.status();
  assert.equal(status.state, "blocked");
  assert.equal(status.state === "blocked" ? status.reason : null, "driver_failure");
});

test("authenticationRequired notifies session-expired listeners after discarding the session", async () => {
  const harness = createHarness();
  let expired = 0;
  const unsubscribe = subscribeBrowserSessionExpired(() => {
    expired += 1;
  });
  await harness.driver.connect("token-1");
  harness.respondWith("sync_cycle", {
    status: { state: "authenticationRequired" },
    retryAtMs: null,
    changes: { noteIds: [], structureChanged: false, full: false },
  });
  await harness.runDueTimer();
  unsubscribe();

  assert.equal(expired, 1);
  assert.equal(harness.discardedSessions.length, 1);
});

test("a rejected provision notifies session-expired listeners", async () => {
  const harness = createHarness({
    provision: () => Promise.reject(new SyncSessionRejectedError("expired")),
  });
  let expired = 0;
  const unsubscribe = subscribeBrowserSessionExpired(() => {
    expired += 1;
  });
  await assert.rejects(() => harness.driver.connect("expired-token"), /expired/);
  unsubscribe();
  assert.equal(expired, 1);
});

test("the fallback poll follows the wake channel and window visibility", async () => {
  assert.equal(pollIntervalMs(true, false, false), POLL_CHANNEL_CONNECTED_MS);
  assert.equal(pollIntervalMs(false, true, true), POLL_VISIBLE_FOCUSED_MS);
  assert.equal(pollIntervalMs(false, true, false), POLL_VISIBLE_UNFOCUSED_MS);
  assert.equal(pollIntervalMs(false, false, true), POLL_HIDDEN_MS);

  const harness = createHarness();
  await harness.driver.connect("token-1");
  await harness.runDueTimer();
  assert.equal(lastDelay(harness), POLL_VISIBLE_FOCUSED_MS);

  harness.driver.setVisibility(true, false);
  assert.equal(lastDelay(harness), POLL_VISIBLE_UNFOCUSED_MS);
  harness.driver.setVisibility(false, false);
  assert.equal(lastDelay(harness), POLL_HIDDEN_MS);
  harness.pushChannels[0]?.onChannelState(true);
  assert.equal(lastDelay(harness), POLL_CHANNEL_CONNECTED_MS);
  harness.pushChannels[0]?.onChannelState(false);
  harness.driver.setVisibility(true, true);
  assert.equal(lastDelay(harness), POLL_VISIBLE_FOCUSED_MS);
});

test("offline is a hint that probes every fifteen seconds and any wake clears it", async () => {
  const harness = createHarness();
  await harness.driver.connect("token-1");
  await harness.runDueTimer();

  harness.driver.setOnline(false);
  assert.equal(lastDelay(harness), OFFLINE_PROBE_MS);
  await harness.runDueTimer();
  assert.ok(harness.requests.filter((request) => request.kind === "sync_cycle").length >= 2);

  harness.driver.notifyLocalCommit();
  assert.equal(lastDelay(harness), 0);
  await harness.runDueTimer();
  assert.equal(lastDelay(harness), POLL_VISIBLE_FOCUSED_MS, "a successful cycle flips online");
});

test("refresh clears the retry delay through the worker and cycles at once", async () => {
  const harness = createHarness();
  await harness.driver.connect("token-1");
  harness.respondWith("sync_cycle", {
    status: { state: "retrying", nextAttemptAt: 9_000 },
    retryAtMs: 9_000,
    changes: { noteIds: [], structureChanged: false, full: false },
  });
  await harness.runDueTimer();
  assert.equal(lastDelay(harness), 8_000);

  await harness.driver.refresh();
  assert.ok(harness.requests.some((request) => request.kind === "sync_refresh"));
  assert.equal(lastDelay(harness), 0);
});

test("a commit during a running cycle interrupts it and the cycle reschedules", async () => {
  const harness = createHarness();
  await harness.driver.connect("token-1");
  let finishCycle: (() => void) | null = null;
  harness.respondWith("sync_cycle", undefined);
  const dependencies = harness.driver;
  const pendingCycle = new Promise<unknown>((resolve) => {
    finishCycle = () =>
      resolve({
        status: { state: "pending" },
        retryAtMs: null,
        changes: { noteIds: [], structureChanged: false, full: false },
      });
  });
  const harnessWithSlowCycle = createHarness({
    port: {
      request: (kind) => {
        if (kind === "sync_cycle") return pendingCycle;
        if (kind === "sync_interrupt") {
          interrupts += 1;
          return Promise.resolve(undefined);
        }
        return Promise.resolve(kind === "sync_connection" ? null : { state: "connecting" });
      },
    },
  });
  let interrupts = 0;
  void dependencies;
  await harnessWithSlowCycle.driver.connect("token-1");
  await harnessWithSlowCycle.runDueTimer();
  harnessWithSlowCycle.driver.interruptForCommit();
  harnessWithSlowCycle.driver.notifyLocalCommit();
  assert.equal(interrupts, 1, "the interrupt is posted while the cycle runs");
  finishCycle?.();
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
  assert.equal(lastDelay(harnessWithSlowCycle), 0, "the interrupted cycle reschedules");

  harnessWithSlowCycle.driver.interruptForCommit();
  assert.equal(interrupts, 1, "no interrupt is posted while no cycle runs");
});

test("driver failures classify by code, terminal flag, and lost-session messages", () => {
  assert.equal(classifyDriverFailure(new Error("network")), "transient");
  assert.equal(
    classifyDriverFailure({ code: "backend", message: "", recovery: "", terminal: false }),
    "transient",
  );
  assert.equal(
    classifyDriverFailure({ code: "worker_crashed", message: "", recovery: "", terminal: true }),
    "terminal",
  );
  assert.equal(
    classifyDriverFailure({ code: "not_ready", message: "", recovery: "", terminal: false }),
    "terminal",
  );
  assert.equal(
    classifyDriverFailure({
      code: "invalid_request",
      message: "Cloud sync has no active session; connect before requesting a cycle.",
      recovery: "",
      terminal: false,
    }),
    "terminal",
  );
});
