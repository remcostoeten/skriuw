import { authConfiguration } from "@/features/auth/config";
import {
  clearBrowserSessionToken,
  loadBrowserSessionToken,
} from "@/features/auth/session-store";
import { noop } from "@/shared/lib/noop";
import type { WorkspaceSyncStatus } from "./commands";

/**
 * Scheduling driver for the worker-owned browser sync runtime. The storage
 * worker executes each bounded sync cycle with the shared Rust coordinator
 * logic; this module only decides when to ask for the next cycle, mirroring
 * the desktop coordinator: local commits, focus, coming back online, wake
 * channel notifications, and retry deadlines all collapse into one scheduled
 * cycle, the fallback poll adapts to the wake channel and window visibility,
 * and driver failures back off or re-establish the session without ever
 * silently stopping.
 */

const SYNC_CYCLE_TIMEOUT_MS = 10 * 60 * 1_000;
const MIN_RETRY_DELAY_MS = 1_000;
const MAX_TRANSIENT_BACKOFF_MS = 60_000;
export const OFFLINE_PROBE_MS = 15_000;
export const POLL_CHANNEL_CONNECTED_MS = 60_000;
export const POLL_VISIBLE_FOCUSED_MS = 15_000;
export const POLL_VISIBLE_UNFOCUSED_MS = 60_000;
export const POLL_HIDDEN_MS = 5 * 60_000;
export const RETRYING_OVERLAY_AFTER_FAILURES = 2;
export const DRIVER_FAILURE_AFTER_RECONNECTS = 5;
export const DRIVER_FAILURE_REASON = "driver_failure";

export type BrowserSyncProgress = {
  phase: "hydrating" | "downloading" | "uploading";
  transferredChunks: number;
  transferredBytes: number;
  expectedChunks: number | null;
  expectedBytes: number | null;
};

export type BrowserSyncChange = {
  noteIds: string[];
  structureChanged: boolean;
  full: boolean;
};

export type SyncWorkerPort = {
  request(
    kind: string,
    payload: unknown,
    expected: string,
    timeoutMs?: number,
  ): Promise<unknown>;
};

type BrowserSyncConnection = {
  workspaceId: string;
  deviceId: string;
  observedServerSequence: number;
};

type BrowserSyncCycleReport = {
  status: WorkspaceSyncStatus;
  retryAtMs: number | null;
  changes?: Partial<BrowserSyncChange> | null;
};

type ProvisionedWorkspace = {
  workspaceId: string;
  deviceId: string;
};

export type PushChannelConnection = {
  workspaceId: string;
  deviceId: string;
  token: string;
  baseUrl: string;
};

export type BrowserSyncDriverDependencies = {
  port: SyncWorkerPort;
  baseUrl(): string;
  provision(token: string, deviceId: string, baseUrl: string): Promise<ProvisionedWorkspace>;
  createDeviceId(): string;
  now(): number;
  setTimer(callback: () => void, delayMs: number): unknown;
  clearTimer(handle: unknown): void;
  persistedToken(): string | undefined;
  discardPersistedSession(): void;
  openPushChannel(
    connection: PushChannelConnection,
    onWake: () => void,
    onChannelState: (connected: boolean) => void,
  ): () => void;
};

export type BrowserSyncDriver = {
  status(): Promise<WorkspaceSyncStatus>;
  connect(token: string, baseUrl?: string): Promise<WorkspaceSyncStatus>;
  resume(): Promise<WorkspaceSyncStatus>;
  pause(): Promise<WorkspaceSyncStatus>;
  stop(): void;
  retry(): Promise<WorkspaceSyncStatus>;
  refresh(): Promise<WorkspaceSyncStatus>;
  notifyLocalCommit(): void;
  interruptForCommit(): void;
  wake(): void;
  setOnline(online: boolean): void;
  setVisibility(visible: boolean, focused: boolean): void;
  setWakeChannelConnected(connected: boolean): void;
};

/** The cloud service rejected the session credential itself. */
export class SyncSessionRejectedError extends Error {}

export type DriverFailureKind = "transient" | "terminal";

const TERMINAL_FAILURE_CODES = new Set([
  "worker_crashed",
  "timed_out",
  "shutdown",
  "shutting_down",
  "not_ready",
]);

/**
 * Splits driver failures into the two reactions the scheduler has: a
 * transient failure is retried with backoff on the same session; a terminal
 * one (dead worker, lost session) can only be repaired by re-establishing
 * the session from the persisted token.
 */
export function classifyDriverFailure(error: unknown): DriverFailureKind {
  if (typeof error !== "object" || error === null) return "transient";
  const failure = error as { code?: unknown; terminal?: unknown; message?: unknown };
  if (failure.terminal === true) return "terminal";
  if (typeof failure.code === "string" && TERMINAL_FAILURE_CODES.has(failure.code)) {
    return "terminal";
  }
  if (typeof failure.message === "string" && failure.message.includes("no active session")) {
    return "terminal";
  }
  return "transient";
}

/** Fallback poll interval from the wake-channel state and window visibility. */
export function pollIntervalMs(
  channelConnected: boolean,
  visible: boolean,
  focused: boolean,
): number {
  if (channelConnected) return POLL_CHANNEL_CONNECTED_MS;
  if (!visible) return POLL_HIDDEN_MS;
  return focused ? POLL_VISIBLE_FOCUSED_MS : POLL_VISIBLE_UNFOCUSED_MS;
}

type ScheduledKind = "immediate" | "retry" | "poll";

export function createBrowserSyncDriver(
  dependencies: BrowserSyncDriverDependencies,
): BrowserSyncDriver {
  let active = false;
  let cycleInFlight = false;
  let wakeRequested = false;
  let resumeAttempted = false;
  let sessionLost = false;
  let reestablishing = false;
  let timer: unknown = null;
  let scheduledKind: ScheduledKind = "poll";
  let closePushChannel: (() => void) | null = null;
  let online = true;
  let visible = true;
  let focused = true;
  let channelConnected = false;
  let consecutiveFailures = 0;
  let transientDelayMs = MIN_RETRY_DELAY_MS;
  let nextAttemptAt: number | null = null;
  let reconnectFailures = 0;

  function teardownPushChannel(): void {
    channelConnected = false;
    if (closePushChannel === null) return;
    const close = closePushChannel;
    closePushChannel = null;
    close();
  }

  function openPushChannel(connection: PushChannelConnection): void {
    teardownPushChannel();
    try {
      closePushChannel = dependencies.openPushChannel(connection, wake, setWakeChannelConnected);
    } catch (error) {
      console.error("sync push channel could not open", error);
    }
  }

  function clearScheduled(): void {
    if (timer !== null) {
      dependencies.clearTimer(timer);
      timer = null;
    }
  }

  function schedule(delayMs: number, kind: ScheduledKind): void {
    if (!active) return;
    clearScheduled();
    scheduledKind = kind;
    timer = dependencies.setTimer(
      () => {
        timer = null;
        void runCycle();
      },
      Math.max(0, delayMs),
    );
  }

  function pollDelayMs(): number {
    if (!online) return OFFLINE_PROBE_MS;
    return pollIntervalMs(channelConnected, visible, focused);
  }

  function scheduleRetry(delayMs: number): void {
    schedule(Math.min(Math.max(delayMs, MIN_RETRY_DELAY_MS), pollDelayMs()), "retry");
  }

  function reschedulePoll(): void {
    if (!active || cycleInFlight || timer === null || scheduledKind !== "poll") return;
    schedule(pollDelayMs(), "poll");
  }

  function clearFailureState(): void {
    consecutiveFailures = 0;
    transientDelayMs = MIN_RETRY_DELAY_MS;
    nextAttemptAt = null;
  }

  function loseSession(): void {
    active = false;
    clearScheduled();
    teardownPushChannel();
  }

  function scheduleFromReport(report: BrowserSyncCycleReport): void {
    switch (report.status.state) {
      case "pending":
      case "rehydrating":
        schedule(0, "immediate");
        return;
      case "retrying":
      case "blocked": {
        if (report.retryAtMs === null) {
          schedule(pollDelayMs(), "poll");
          return;
        }
        scheduleRetry(report.retryAtMs - dependencies.now());
        return;
      }
      case "authenticationRequired":
        loseSession();
        dependencies.discardPersistedSession();
        publishBrowserSessionExpired();
        return;
      case "localOnly":
        loseSession();
        return;
      default:
        online = true;
        schedule(pollDelayMs(), "poll");
    }
  }

  function handleCycleFailure(error: unknown): void {
    if (classifyDriverFailure(error) === "transient") {
      consecutiveFailures += 1;
      const delay = transientDelayMs;
      transientDelayMs = Math.min(transientDelayMs * 2, MAX_TRANSIENT_BACKOFF_MS);
      nextAttemptAt = dependencies.now() + delay;
      console.error("browser sync cycle failed; retrying", error);
      schedule(delay, "retry");
      return;
    }
    console.error("browser sync session was lost; re-establishing on the next wake", error);
    loseSession();
    sessionLost = true;
    resumeAttempted = false;
  }

  async function runCycle(): Promise<void> {
    if (!active) return;
    if (cycleInFlight) {
      wakeRequested = true;
      return;
    }
    cycleInFlight = true;
    try {
      const report = (await dependencies.port.request(
        "sync_cycle",
        undefined,
        "sync_cycle",
        SYNC_CYCLE_TIMEOUT_MS,
      )) as BrowserSyncCycleReport;
      clearFailureState();
      reconnectFailures = 0;
      publishBrowserWorkspaceChange(report.changes);
      scheduleFromReport(report);
    } catch (error) {
      handleCycleFailure(error);
    } finally {
      cycleInFlight = false;
      if (wakeRequested) {
        wakeRequested = false;
        schedule(0, "immediate");
      }
    }
  }

  function overlay(base: WorkspaceSyncStatus): WorkspaceSyncStatus {
    if (reconnectFailures >= DRIVER_FAILURE_AFTER_RECONNECTS) {
      return {
        state: "blocked",
        reason: DRIVER_FAILURE_REASON,
        detail: `cloud sync could not be re-established after ${reconnectFailures} attempts`,
      };
    }
    if (consecutiveFailures >= RETRYING_OVERLAY_AFTER_FAILURES && nextAttemptAt !== null) {
      return { state: "retrying", nextAttemptAt };
    }
    return base;
  }

  async function status(): Promise<WorkspaceSyncStatus> {
    // A status query queued behind an executing sync cycle only resolves when
    // that cycle finishes, so it must share the cycle deadline instead of the
    // default worker timeout that would terminate the worker mid-hydration.
    try {
      const base = (await dependencies.port.request(
        "sync_status",
        undefined,
        "sync_status",
        SYNC_CYCLE_TIMEOUT_MS,
      )) as WorkspaceSyncStatus;
      return overlay(base);
    } catch (error) {
      const failure = error as { message?: unknown };
      return overlay({
        state: "blocked",
        reason: DRIVER_FAILURE_REASON,
        detail: typeof failure?.message === "string" ? failure.message : null,
      });
    }
  }

  async function connect(token: string, baseUrl?: string): Promise<WorkspaceSyncStatus> {
    try {
      return await establishSession(token, baseUrl ?? dependencies.baseUrl());
    } catch (error) {
      if (error instanceof SyncSessionRejectedError) {
        dependencies.discardPersistedSession();
        publishBrowserSessionExpired();
      }
      throw error;
    }
  }

  async function establishSession(
    token: string,
    baseUrl: string,
  ): Promise<WorkspaceSyncStatus> {
    const existing = (await dependencies.port.request(
      "sync_connection",
      undefined,
      "sync_connection",
    )) as BrowserSyncConnection | null;
    const deviceId = existing?.deviceId ?? dependencies.createDeviceId();
    const provisioned = await dependencies.provision(token, deviceId, baseUrl);
    if (provisioned.deviceId !== deviceId) {
      throw new Error("cloud provisioning returned a different device identity");
    }
    if (existing && existing.workspaceId !== provisioned.workspaceId) {
      throw new Error(
        "This local workspace is linked to another cloud workspace. Sign back into its original account and cloud environment, or open a fresh local workspace before linking a different account.",
      );
    }
    const connected = (await dependencies.port.request(
      "sync_connect",
      {
        token,
        baseUrl,
        workspaceId: provisioned.workspaceId,
        deviceId,
      },
      "sync_status",
    )) as WorkspaceSyncStatus;
    active = true;
    sessionLost = false;
    reconnectFailures = 0;
    clearFailureState();
    openPushChannel({ workspaceId: provisioned.workspaceId, deviceId, token, baseUrl });
    schedule(0, "immediate");
    return connected;
  }

  /**
   * One attempt to reopen sync from a persisted session. Only a workspace
   * with a durable cloud connection resumes; linking a workspace remains an
   * explicit user action. The server stays the authority: a rejected
   * credential clears the persisted session and the workspace degrades to
   * `authenticationRequired`, while transient failures keep the session for
   * the next wake. After a lost session every wake retries the attempt.
   */
  async function resume(): Promise<WorkspaceSyncStatus> {
    if (resumeAttempted || active) return status();
    resumeAttempted = true;
    const token = dependencies.persistedToken();
    if (!token) return status();
    try {
      const existing = (await dependencies.port.request(
        "sync_connection",
        undefined,
        "sync_connection",
      )) as BrowserSyncConnection | null;
      if (!existing) return status();
      return await connect(token);
    } catch (error) {
      if (sessionLost) reconnectFailures += 1;
      if (!(error instanceof SyncSessionRejectedError)) {
        console.error("cloud sync resume failed", error);
      }
      return status();
    }
  }

  async function reestablish(): Promise<void> {
    if (reestablishing || active) return;
    reestablishing = true;
    resumeAttempted = false;
    try {
      await resume();
    } finally {
      reestablishing = false;
    }
  }

  async function pause(): Promise<WorkspaceSyncStatus> {
    active = false;
    sessionLost = false;
    clearScheduled();
    teardownPushChannel();
    return (await dependencies.port.request(
      "sync_disconnect",
      undefined,
      "sync_status",
    )) as WorkspaceSyncStatus;
  }

  function stop(): void {
    active = false;
    sessionLost = false;
    wakeRequested = false;
    clearScheduled();
    teardownPushChannel();
  }

  async function refresh(): Promise<WorkspaceSyncStatus> {
    clearFailureState();
    online = true;
    if (active) {
      try {
        await dependencies.port.request("sync_refresh", undefined, "unit");
      } catch (error) {
        console.error("sync refresh could not clear retry delays", error);
      }
      schedule(0, "immediate");
    } else if (sessionLost) {
      void reestablish();
    }
    return status();
  }

  function notifyLocalCommit(): void {
    wake();
  }

  function interruptForCommit(): void {
    if (!active || !cycleInFlight) return;
    void dependencies.port.request("sync_interrupt", undefined, "unit").catch(noop);
  }

  function wake(): void {
    online = true;
    if (active) {
      schedule(0, "immediate");
      return;
    }
    if (sessionLost) void reestablish();
  }

  function setOnline(nextOnline: boolean): void {
    if (nextOnline) {
      transientDelayMs = MIN_RETRY_DELAY_MS;
      wake();
      return;
    }
    online = false;
    if (active && !cycleInFlight) schedule(OFFLINE_PROBE_MS, "poll");
  }

  function setVisibility(nextVisible: boolean, nextFocused: boolean): void {
    visible = nextVisible;
    focused = nextFocused;
    reschedulePoll();
  }

  function setWakeChannelConnected(connected: boolean): void {
    channelConnected = connected;
    reschedulePoll();
  }

  return {
    status,
    connect,
    resume,
    pause,
    stop,
    retry: refresh,
    refresh,
    notifyLocalCommit,
    interruptForCommit,
    wake,
    setOnline,
    setVisibility,
    setWakeChannelConnected,
  };
}

const progressListeners = new Set<(progress: BrowserSyncProgress) => void>();
const workspaceChangeListeners = new Set<(change: BrowserSyncChange) => void>();
const sessionExpiredListeners = new Set<() => void>();
let lastProgress: BrowserSyncProgress | null = null;

function isSyncProgress(value: unknown): value is BrowserSyncProgress {
  const progress = value as Partial<BrowserSyncProgress> | null;
  return (
    progress !== null &&
    typeof progress === "object" &&
    (progress.phase === "hydrating" ||
      progress.phase === "downloading" ||
      progress.phase === "uploading") &&
    typeof progress.transferredChunks === "number" &&
    typeof progress.transferredBytes === "number"
  );
}

/** Fed by the storage worker's out-of-band notifications. */
export function publishBrowserSyncEvent(value: unknown): void {
  if (!isSyncProgress(value)) return;
  lastProgress = value;
  for (const listener of progressListeners) listener(value);
}

/**
 * Hydration and transfer progress for shell surfaces. The worker posts these
 * while a sync request is still executing, so a first-connect checkpoint
 * hydration stays visible instead of appearing hung.
 */
export function subscribeBrowserSyncProgress(
  listener: (progress: BrowserSyncProgress) => void,
): () => void {
  progressListeners.add(listener);
  return () => {
    progressListeners.delete(listener);
  };
}

export function latestBrowserSyncProgress(): BrowserSyncProgress | null {
  return lastProgress;
}

/** Remote changes a cycle applied, in the same shape the desktop shell emits. */
export function subscribeBrowserWorkspaceChanges(
  listener: (change: BrowserSyncChange) => void,
): () => void {
  workspaceChangeListeners.add(listener);
  return () => {
    workspaceChangeListeners.delete(listener);
  };
}

/** Fires once the driver has discarded a session the cloud no longer accepts. */
export function subscribeBrowserSessionExpired(listener: () => void): () => void {
  sessionExpiredListeners.add(listener);
  return () => {
    sessionExpiredListeners.delete(listener);
  };
}

function normalizeChange(changes: Partial<BrowserSyncChange> | null | undefined): BrowserSyncChange {
  return {
    noteIds: Array.isArray(changes?.noteIds)
      ? changes.noteIds.filter((id): id is string => typeof id === "string")
      : [],
    structureChanged: changes?.structureChanged === true,
    full: changes?.full === true,
  };
}

function publishBrowserWorkspaceChange(changes: Partial<BrowserSyncChange> | null | undefined): void {
  const change = normalizeChange(changes);
  if (!change.full && !change.structureChanged && change.noteIds.length === 0) return;
  for (const listener of workspaceChangeListeners) listener(change);
}

function publishBrowserSessionExpired(): void {
  for (const listener of sessionExpiredListeners) listener();
}

async function provisionBrowserDevice(
  token: string,
  deviceId: string,
  baseUrl: string,
): Promise<ProvisionedWorkspace> {
  const response = await fetch(`${baseUrl}/v1/sync/provision`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ deviceId }),
  });
  if (response.status === 401) {
    throw new SyncSessionRejectedError("your Skriuw session expired; sign in again");
  }
  if (response.status === 403) {
    throw new Error("this device is not allowed to use cloud sync");
  }
  if (!response.ok) {
    throw new Error(
      response.status >= 500
        ? "Skriuw cloud is temporarily unavailable"
        : "Skriuw cloud rejected the sync setup request",
    );
  }
  const provisioned = (await response.json()) as Partial<ProvisionedWorkspace>;
  if (
    typeof provisioned.workspaceId !== "string" ||
    typeof provisioned.deviceId !== "string"
  ) {
    throw new Error("cloud provisioning response was invalid");
  }
  return { workspaceId: provisioned.workspaceId, deviceId: provisioned.deviceId };
}

function trustedCloudBaseUrl(): string {
  if (!authConfiguration.available) {
    throw new Error(authConfiguration.reason);
  }
  return authConfiguration.baseUrl;
}

function createBrowserDeviceId(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

const PUSH_CHANNEL_MIN_RETRY_MS = 1_000;
const PUSH_CHANNEL_MAX_RETRY_MS = 60_000;
const SYNC_EVENTS_SUBPROTOCOL = "skriuw-sync-v1";

/**
 * Wake-hint WebSocket to the workspace events endpoint. Browsers cannot attach
 * an Authorization header to a WebSocket, so the bearer token rides a
 * `skriuw-bearer.<token>` subprotocol entry. Every failure only schedules a
 * capped reconnect: correctness always comes from the polled sync cycle, and
 * the channel state only shapes how often that poll runs.
 */
function openBrowserPushChannel(
  connection: PushChannelConnection,
  onWake: () => void,
  onChannelState: (connected: boolean) => void,
): () => void {
  let socket: WebSocket | null = null;
  let retryTimer: number | null = null;
  let retryDelayMs = PUSH_CHANNEL_MIN_RETRY_MS;
  let closed = false;

  function scheduleReconnect(): void {
    if (closed || retryTimer !== null) return;
    retryTimer = window.setTimeout(() => {
      retryTimer = null;
      open();
    }, retryDelayMs);
    retryDelayMs = Math.min(retryDelayMs * 2, PUSH_CHANNEL_MAX_RETRY_MS);
  }

  function open(): void {
    if (closed) return;
    const token = loadBrowserSessionToken() ?? connection.token;
    const url =
      connection.baseUrl.replace(/^http/, "ws") +
      `/v1/workspaces/${connection.workspaceId}/events?deviceId=${connection.deviceId}`;
    try {
      socket = new WebSocket(url, [
        SYNC_EVENTS_SUBPROTOCOL,
        `skriuw-bearer.${token}`,
      ]);
    } catch (error) {
      console.error("sync push channel could not connect", error);
      scheduleReconnect();
      return;
    }
    socket.onopen = () => {
      retryDelayMs = PUSH_CHANNEL_MIN_RETRY_MS;
      onChannelState(true);
    };
    socket.onmessage = (event) => {
      let message: { type?: string } | null = null;
      try {
        message = JSON.parse(String(event.data)) as { type?: string };
      } catch {
        noop();
      }
      if (message?.type === "workspaceChanged") onWake();
    };
    socket.onclose = () => {
      socket = null;
      onChannelState(false);
      scheduleReconnect();
    };
  }

  open();
  return () => {
    closed = true;
    if (retryTimer !== null) {
      window.clearTimeout(retryTimer);
      retryTimer = null;
    }
    if (socket !== null) {
      const activeSocket = socket;
      socket = null;
      activeSocket.onclose = null;
      activeSocket.close();
    }
    onChannelState(false);
  };
}

let sharedDriver: BrowserSyncDriver | null = null;

export function browserSyncDriver(port: SyncWorkerPort): BrowserSyncDriver {
  if (sharedDriver) return sharedDriver;
  sharedDriver = createBrowserSyncDriver({
    port,
    baseUrl: trustedCloudBaseUrl,
    provision: provisionBrowserDevice,
    createDeviceId: createBrowserDeviceId,
    now: () => Date.now(),
    setTimer: (callback, delayMs) => window.setTimeout(callback, delayMs),
    clearTimer: (handle) => window.clearTimeout(handle as number),
    persistedToken: loadBrowserSessionToken,
    discardPersistedSession: clearBrowserSessionToken,
    openPushChannel: openBrowserPushChannel,
  });
  const driver = sharedDriver;
  window.addEventListener("focus", () => driver.wake());
  return sharedDriver;
}
