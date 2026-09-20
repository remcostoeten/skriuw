import assert from "node:assert/strict";
import test from "node:test";
import {
  backgroundStrategySummary,
  describeBackgroundStrategy,
  runBackgroundRefresh,
} from "../background";
import { createSyncLifecycle } from "../lifecycle";
import type { LifecyclePort } from "../lifecycle";
import type { MobileSyncPort, SyncRecoveryView, WorkspaceSyncStatus } from "../port";
import { createRecoverySurface, DISCARD_CONFIRMATION } from "../recovery";
import type { RecoveryView } from "../recovery";
import { describeSyncStatus, syncEnabled } from "../status";
import { createWakeChannel, isWorkspaceChanged } from "../wake-channel";
import type { WakeSocketHandlers } from "../wake-channel";

type Call = string;

function recordingPort(overrides: Partial<MobileSyncPort> = {}): {
  port: MobileSyncPort;
  calls: Call[];
} {
  const calls: Call[] = [];
  const upToDate: WorkspaceSyncStatus = { state: "upToDate" };
  const port: MobileSyncPort = {
    workspaceSyncStatus: async () => upToDate,
    connectWorkspaceSync: async () => upToDate,
    pauseWorkspaceSync: async () => ({ state: "localOnly" }),
    refreshWorkspaceSync: async () => upToDate,
    setWorkspaceSyncOnline: async (online) => {
      calls.push(`online:${online}`);
    },
    setWorkspaceSyncVisibility: async (visible, focused) => {
      calls.push(`visibility:${visible}:${focused}`);
    },
    listBlockedSyncOperations: async () => ({ viewVersion: 1, blocked: [], discarded: [] }),
    retryBlockedSyncOperation: async () => ({ viewVersion: 1, blocked: [], discarded: [] }),
    discardBlockedSyncOperation: async () => ({ viewVersion: 1, blocked: [], discarded: [] }),
    catchUpWorkspaceSync: async () => {
      calls.push("catch-up");
      return upToDate;
    },
    backgroundRefreshWorkspaceSync: async () => {
      calls.push("background-refresh");
      return upToDate;
    },
    workspaceWakeChannelUrl: async () => "wss://sync.skriuw.app/v1/events",
    setWakeChannelConnected: async (connected) => {
      calls.push(`channel:${connected}`);
    },
    notifyRemoteChange: async () => {
      calls.push("remote-change");
    },
    ...overrides,
  };
  return { port, calls };
}

function settable<T>(initial: T): LifecyclePort<T> & { set: (value: T) => void } {
  let value = initial;
  const listeners = new Set<(value: T) => void>();
  return {
    current: () => value,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(next) {
      value = next;
      for (const listener of listeners) listener(next);
    },
  };
}

function recordingChannel(calls: Call[]): {
  open: () => void;
  close: () => void;
  connected: () => boolean;
} {
  let open = false;
  return {
    open() {
      open = true;
      calls.push("channel-open");
    },
    close() {
      open = false;
      calls.push("channel-close");
    },
    connected: () => open,
  };
}

/** Lets the lifecycle's internal promise queue drain. */
async function settle(): Promise<void> {
  for (let index = 0; index < 20; index += 1) {
    await Promise.resolve();
  }
}

test("every sync state reads as something a phone screen can act on", () => {
  const states: WorkspaceSyncStatus[] = [
    { state: "localOnly" },
    { state: "connecting" },
    { state: "upToDate" },
    { state: "pending" },
    { state: "offline" },
    { state: "authenticationRequired" },
    { state: "rehydrating" },
    { state: "retrying", nextAttemptAt: 1 },
    { state: "blocked", reason: "push_conflict", detail: null },
  ];
  for (const status of states) {
    const presentation = describeSyncStatus(status);
    assert.ok(presentation.summary.length > 0, `${status.state} needs a summary`);
    assert.ok(presentation.summary.length <= 40, `${status.state} summary is too long for a row`);
  }

  assert.equal(describeSyncStatus({ state: "authenticationRequired" }).action, "sign-in");
  assert.equal(describeSyncStatus({ state: "localOnly" }).action, "resume");
  assert.equal(
    describeSyncStatus({ state: "blocked", reason: "push_conflict", detail: null }).action,
    "review-blocked",
  );
  assert.equal(syncEnabled({ state: "upToDate" }), true);
  assert.equal(syncEnabled({ state: "authenticationRequired" }), false);
});

test("an unrecognised blocked reason never puts an internal string in front of the user", () => {
  const unknown = describeSyncStatus({
    state: "blocked",
    reason: "something_a_newer_core_invented",
    detail: null,
  });
  assert.ok(!unknown.detail?.includes("something_a_newer_core_invented"));
  const withDetail = describeSyncStatus({
    state: "blocked",
    reason: "something_a_newer_core_invented",
    detail: "quota exceeded",
  });
  assert.ok(withDetail.detail?.endsWith("quota exceeded"));
});

test("returning to the foreground catches up before the wake channel is trusted", async () => {
  const { port, calls } = recordingPort();
  const foreground = settable(false);
  const lifecycle = createSyncLifecycle({
    port,
    foreground,
    online: settable(true),
    wakeChannel: recordingChannel(calls),
  });

  const stop = lifecycle.start();
  await settle();
  assert.deepEqual(calls, ["online:true", "channel-close", "visibility:false:false"]);

  calls.length = 0;
  foreground.set(true);
  await settle();
  assert.deepEqual(calls, ["visibility:true:true", "catch-up", "channel-open"]);
  stop();
});

test("the resume catch-up runs even when the wake channel never connected", async () => {
  const { port, calls } = recordingPort();
  const foreground = settable(true);
  const channel = {
    open: () => {
      throw new Error("the socket could not be created");
    },
    close: () => calls.push("channel-close"),
    connected: () => false,
  };
  const errors: unknown[] = [];
  const lifecycle = createSyncLifecycle({
    port,
    foreground,
    online: settable(true),
    wakeChannel: channel,
    reportError: (error) => errors.push(error),
  });

  const stop = lifecycle.start();
  await settle();

  // The catch-up is what makes the device converge, so it has to have already
  // happened by the time the channel fails.
  assert.ok(calls.includes("catch-up"));
  assert.equal(errors.length, 1);
  stop();
});

test("backgrounding retires the channel before the coordinator is told to slow down", async () => {
  const { port, calls } = recordingPort();
  const foreground = settable(true);
  const lifecycle = createSyncLifecycle({
    port,
    foreground,
    online: settable(true),
    wakeChannel: recordingChannel(calls),
  });

  const stop = lifecycle.start();
  await settle();
  calls.length = 0;

  foreground.set(false);
  await settle();
  assert.deepEqual(calls, ["channel-close", "visibility:false:false"]);
  stop();
});

test("a burst of lifecycle signals never interleaves two resume sequences", async () => {
  const { port, calls } = recordingPort();
  const foreground = settable(false);
  const lifecycle = createSyncLifecycle({
    port,
    foreground,
    online: settable(true),
    wakeChannel: recordingChannel(calls),
  });
  const stop = lifecycle.start();
  await settle();
  calls.length = 0;

  foreground.set(true);
  foreground.set(false);
  foreground.set(true);
  await settle();

  assert.deepEqual(calls, [
    "visibility:true:true",
    "catch-up",
    "channel-open",
    "channel-close",
    "visibility:false:false",
    "visibility:true:true",
    "catch-up",
    "channel-open",
  ]);
  stop();
});

test("coming back online catches up, and going offline is only advice", async () => {
  const { port, calls } = recordingPort();
  const online = settable(true);
  const lifecycle = createSyncLifecycle({
    port,
    foreground: settable(true),
    online,
    wakeChannel: recordingChannel(calls),
  });
  const stop = lifecycle.start();
  await settle();
  calls.length = 0;

  online.set(false);
  await settle();
  assert.deepEqual(calls, ["online:false"]);

  online.set(true);
  await settle();
  assert.deepEqual(calls, ["online:false", "online:true", "catch-up"]);
  stop();
});

test("stopping the lifecycle closes the channel and ignores later signals", async () => {
  const { port, calls } = recordingPort();
  const foreground = settable(true);
  const lifecycle = createSyncLifecycle({
    port,
    foreground,
    online: settable(true),
    wakeChannel: recordingChannel(calls),
  });
  const stop = lifecycle.start();
  await settle();

  stop();
  calls.length = 0;
  foreground.set(false);
  foreground.set(true);
  await settle();
  assert.deepEqual(calls, []);
});

test("a background refresh does not wait behind the foreground queue", async () => {
  const { port, calls } = recordingPort();
  const lifecycle = createSyncLifecycle({
    port,
    foreground: settable(false),
    online: settable(true),
    wakeChannel: recordingChannel(calls),
  });

  // Deliberately without `start()`: a background task can be handed the
  // process before anything rendered.
  assert.deepEqual(await lifecycle.backgroundRefresh(), { state: "upToDate" });
  assert.deepEqual(calls, ["background-refresh"]);
});

test("a background window the platform withdraws is expired rather than failed", async () => {
  let release = (): void => undefined;
  const expiration = new Promise<void>((resolve) => {
    release = resolve;
  });
  const outcome = runBackgroundRefresh({
    refresh: () => new Promise(() => undefined),
    expiration,
  });
  release();
  assert.deepEqual(await outcome, { kind: "expired" });

  assert.deepEqual(
    await runBackgroundRefresh({
      refresh: async () => undefined,
      expiration: new Promise(() => undefined),
    }),
    { kind: "completed" },
  );
});

test("a background refresh never rejects, because a crash report is worse than stale notes", async () => {
  const errors: unknown[] = [];
  const outcome = await runBackgroundRefresh({
    refresh: async () => {
      throw new Error("the native core is closed");
    },
    expiration: new Promise(() => undefined),
    reportError: (error) => errors.push(error),
  });

  assert.deepEqual(outcome, { kind: "failed", message: "the native core is closed" });
  assert.equal(errors.length, 1);
});

test("only the resume catch-up is promised; everything faster is best-effort", () => {
  for (const platform of ["ios", "android"] as const) {
    const capabilities = describeBackgroundStrategy(platform);
    const guaranteed = capabilities.filter((entry) => entry.guarantee === "guaranteed");
    assert.deepEqual(
      guaranteed.map((entry) => entry.trigger),
      ["foreground-resume"],
      `${platform} must promise exactly the resume catch-up`,
    );
    assert.ok(backgroundStrategySummary(platform).length > 0);
  }
  const ios = describeBackgroundStrategy("ios");
  assert.ok(
    ios.some((entry) => entry.trigger === "scheduled-task" && entry.detail.includes("iOS decides")),
    "the iOS copy must say who decides",
  );
});

test("the wake channel only wakes on a workspace change", () => {
  assert.equal(isWorkspaceChanged(JSON.stringify({ type: "workspaceChanged" })), true);
  assert.equal(isWorkspaceChanged(JSON.stringify({ type: "hello" })), false);
  assert.equal(isWorkspaceChanged("pong"), false);
  assert.equal(isWorkspaceChanged(""), false);
});

type OpenSocket = { handlers: WakeSocketHandlers; closed: boolean; bearer: string };

function channelHarness(target: { url: string; bearer: string } | null = {
  url: "wss://sync.skriuw.app/v1/events",
  bearer: "session-token",
}): {
  sockets: OpenSocket[];
  connected: boolean[];
  wakes: number;
  channel: ReturnType<typeof createWakeChannel>;
  runTimers: () => void;
  pendingTimers: () => number;
} {
  const sockets: OpenSocket[] = [];
  const connected: boolean[] = [];
  const scheduled: Array<() => void> = [];
  const state = { wakes: 0 };
  const channel = createWakeChannel({
    target: async () => target,
    socket: (_url, bearer, handlers) => {
      const socket: OpenSocket = { handlers, closed: false, bearer };
      sockets.push(socket);
      return {
        close: () => {
          socket.closed = true;
        },
      };
    },
    timer: {
      schedule: (_delayMs, run) => {
        scheduled.push(run);
        return () => {
          const index = scheduled.indexOf(run);
          if (index >= 0) scheduled.splice(index, 1);
        };
      },
    },
    onConnected: (value) => connected.push(value),
    onRemoteChange: () => {
      state.wakes += 1;
    },
  });
  return {
    sockets,
    connected,
    get wakes() {
      return state.wakes;
    },
    channel,
    runTimers: () => {
      const due = scheduled.splice(0, scheduled.length);
      for (const run of due) run();
    },
    pendingTimers: () => scheduled.length,
  };
}

test("the channel reports a workspace change and nothing else", async () => {
  const harness = channelHarness();
  harness.channel.open();
  await settle();

  const socket = harness.sockets[0];
  assert.ok(socket);
  assert.equal(socket.bearer, "session-token");
  socket.handlers.onOpen();
  assert.equal(harness.channel.connected(), true);
  assert.deepEqual(harness.connected, [true]);

  socket.handlers.onMessage(JSON.stringify({ type: "workspaceChanged" }));
  socket.handlers.onMessage("pong");
  assert.equal(harness.wakes, 1);
});

test("a dropped channel reconnects; a refused credential stops it", async () => {
  const dropped = channelHarness();
  dropped.channel.open();
  await settle();
  dropped.sockets[0]?.handlers.onOpen();
  dropped.sockets[0]?.handlers.onClose(true);
  assert.deepEqual(dropped.connected, [true, false]);
  dropped.runTimers();
  await settle();
  assert.equal(dropped.sockets.length, 2);

  const refused = channelHarness();
  refused.channel.open();
  await settle();
  refused.sockets[0]?.handlers.onClose(false);
  assert.equal(refused.pendingTimers(), 0, "a refused credential must not be retried");
});

test("closing the channel drops the socket and cancels any pending retry", async () => {
  const harness = channelHarness();
  harness.channel.open();
  await settle();
  harness.sockets[0]?.handlers.onOpen();
  harness.sockets[0]?.handlers.onClose(true);
  assert.equal(harness.pendingTimers(), 1);

  harness.channel.close();
  assert.equal(harness.pendingTimers(), 0);
  assert.equal(harness.channel.connected(), false);

  harness.runTimers();
  await settle();
  assert.equal(harness.sockets.length, 1, "a cancelled retry must not open a socket");
});

test("a channel opened before anything connected stays closed without retrying", async () => {
  const harness = channelHarness(null);
  harness.channel.open();
  await settle();

  assert.equal(harness.sockets.length, 0);
  assert.equal(harness.pendingTimers(), 0);
  assert.equal(harness.channel.connected(), false);
});

function blockedView(): SyncRecoveryView {
  return {
    viewVersion: 1,
    blocked: [
      {
        blockedId: "blocked-1",
        operationType: "save_document",
        reasonCode: "asset_content_missing",
        targetId: "note-1",
        targetTitle: "Groceries",
        assetContentHash: "abc",
        assetMimeType: "image/png",
        firstBlockedAt: 1_700_000_000_000,
      },
      {
        blockedId: "blocked-2",
        operationType: "attach_image",
        reasonCode: "operation_too_large",
        targetId: "note-2",
        targetTitle: null,
        assetContentHash: null,
        assetMimeType: null,
        firstBlockedAt: 1_700_000_000_001,
      },
    ],
    discarded: [],
  };
}

function recoveryHarness(overrides: Partial<MobileSyncPort> = {}): {
  views: RecoveryView[];
  surface: ReturnType<typeof createRecoverySurface>;
} {
  const { port } = recordingPort({
    listBlockedSyncOperations: async () => blockedView(),
    ...overrides,
  });
  const views: RecoveryView[] = [];
  const surface = createRecoverySurface({ port, onChange: (view) => views.push(view) });
  return { views, surface };
}

test("blocked changes name what they touched and whether retrying can help", async () => {
  const { surface } = recoveryHarness();
  await surface.refresh();

  const view = surface.view();
  assert.equal(view.kind, "loaded");
  if (view.kind !== "loaded") return;
  assert.equal(view.blocked[0]?.label, "Edit note · Groceries");
  assert.equal(view.blocked[0]?.retryable, true);
  assert.equal(view.blocked[1]?.label, "Attach image · note-2");
  assert.equal(
    view.blocked[1]?.retryable,
    false,
    "an operation sync can never carry must not offer a retry",
  );
});

test("discarding is confirmed, and cancelling leaves the change in place", async () => {
  let discarded = 0;
  const { surface } = recoveryHarness({
    discardBlockedSyncOperation: async () => {
      discarded += 1;
      return { viewVersion: 1, blocked: [], discarded: [] };
    },
  });
  await surface.refresh();

  // Confirming a row that was never asked about does nothing.
  await surface.confirmDiscard("blocked-1");
  assert.equal(discarded, 0);

  surface.askToDiscard("blocked-1");
  const asking = surface.view();
  assert.equal(asking.kind === "loaded" && asking.confirmingDiscardId, "blocked-1");
  assert.ok(DISCARD_CONFIRMATION.includes("cannot be undone"));

  surface.cancelDiscard();
  await surface.confirmDiscard("blocked-1");
  assert.equal(discarded, 0, "cancelling must not leave the discard armed");

  surface.askToDiscard("blocked-1");
  await surface.confirmDiscard("blocked-1");
  assert.equal(discarded, 1);
});

test("a retry that fails leaves the surface readable rather than empty", async () => {
  const { surface } = recoveryHarness({
    retryBlockedSyncOperation: async () => {
      throw new Error("the native core is closed");
    },
  });
  await surface.refresh();
  await surface.retry("blocked-1");

  const view = surface.view();
  assert.equal(view.kind, "failed");
  assert.equal(
    view.kind === "failed" && view.message,
    "The blocked changes could not be read: the native core is closed",
  );
});

test("a second action is refused while one is in flight", async () => {
  let inFlight = 0;
  let peak = 0;
  const { surface } = recoveryHarness({
    retryBlockedSyncOperation: async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return blockedView();
    },
  });
  await surface.refresh();

  await Promise.all([surface.retry("blocked-1"), surface.retry("blocked-2")]);
  assert.equal(peak, 1);
});
