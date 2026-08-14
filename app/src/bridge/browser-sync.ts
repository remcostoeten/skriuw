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
 * the desktop coordinator's wake coalescing: local commits, focus, coming
 * back online, and retry deadlines all collapse into one scheduled cycle.
 */

const SYNC_CYCLE_TIMEOUT_MS = 10 * 60 * 1_000;
const POLL_INTERVAL_MS = 60_000;
const MIN_RETRY_DELAY_MS = 1_000;

export type BrowserSyncProgress = {
  phase: "hydrating" | "downloading" | "uploading";
  transferredChunks: number;
  transferredBytes: number;
  expectedChunks: number | null;
  expectedBytes: number | null;
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
  workspaceChanged: boolean;
};

type ProvisionedWorkspace = {
  workspaceId: string;
  deviceId: string;
};

export type PushChannelConnection = {
  workspaceId: string;
  deviceId: string;
  token: string;
};

export type BrowserSyncDriverDependencies = {
  port: SyncWorkerPort;
  baseUrl(): string;
  provision(token: string, deviceId: string): Promise<ProvisionedWorkspace>;
  createDeviceId(): string;
  now(): number;
  setTimer(callback: () => void, delayMs: number): unknown;
  clearTimer(handle: unknown): void;
  persistedToken(): string | undefined;
  discardPersistedSession(): void;
  openPushChannel(connection: PushChannelConnection, onWake: () => void): () => void;
};

export type BrowserSyncDriver = {
  status(): Promise<WorkspaceSyncStatus>;
  connect(token: string): Promise<WorkspaceSyncStatus>;
  resume(): Promise<WorkspaceSyncStatus>;
  pause(): Promise<WorkspaceSyncStatus>;
  stop(): void;
  retry(): Promise<WorkspaceSyncStatus>;
  notifyLocalCommit(): void;
  wake(): void;
};

/** The cloud service rejected the session credential itself. */
export class SyncSessionRejectedError extends Error {}

export function createBrowserSyncDriver(
  dependencies: BrowserSyncDriverDependencies,
): BrowserSyncDriver {
  let active = false;
  let cycleInFlight = false;
  let wakeRequested = false;
  let resumeAttempted = false;
  let timer: unknown = null;
  let closePushChannel: (() => void) | null = null;

  function teardownPushChannel(): void {
    if (closePushChannel === null) return;
    const close = closePushChannel;
    closePushChannel = null;
    close();
  }

  function openPushChannel(connection: PushChannelConnection): void {
    teardownPushChannel();
    try {
      closePushChannel = dependencies.openPushChannel(connection, wake);
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

  function schedule(delayMs: number): void {
    if (!active) return;
    clearScheduled();
    timer = dependencies.setTimer(
      () => {
        timer = null;
        void runCycle();
      },
      Math.max(0, delayMs),
    );
  }

  function scheduleFromReport(report: BrowserSyncCycleReport): void {
    switch (report.status.state) {
      case "pending":
        schedule(0);
        return;
      case "retrying":
      case "blocked": {
        const delay =
          report.retryAtMs === null
            ? POLL_INTERVAL_MS
            : report.retryAtMs - dependencies.now();
        schedule(Math.max(delay, MIN_RETRY_DELAY_MS));
        return;
      }
      case "authenticationRequired":
        dependencies.discardPersistedSession();
        active = false;
        clearScheduled();
        teardownPushChannel();
        return;
      case "localOnly":
        active = false;
        clearScheduled();
        teardownPushChannel();
        return;
      default:
        schedule(POLL_INTERVAL_MS);
    }
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
      if (report.workspaceChanged) publishBrowserWorkspaceChange();
      scheduleFromReport(report);
    } catch (error) {
      active = false;
      clearScheduled();
      teardownPushChannel();
      console.error("browser sync cycle failed", error);
    } finally {
      cycleInFlight = false;
      if (wakeRequested) {
        wakeRequested = false;
        schedule(0);
      }
    }
  }

  async function status(): Promise<WorkspaceSyncStatus> {
    // A status query queued behind an executing sync cycle only resolves when
    // that cycle finishes, so it must share the cycle deadline instead of the
    // default worker timeout that would terminate the worker mid-hydration.
    return (await dependencies.port.request(
      "sync_status",
      undefined,
      "sync_status",
      SYNC_CYCLE_TIMEOUT_MS,
    )) as WorkspaceSyncStatus;
  }

  async function connect(token: string): Promise<WorkspaceSyncStatus> {
    try {
      return await establishSession(token);
    } catch (error) {
      if (error instanceof SyncSessionRejectedError) {
        dependencies.discardPersistedSession();
      }
      throw error;
    }
  }

  async function establishSession(token: string): Promise<WorkspaceSyncStatus> {
    const existing = (await dependencies.port.request(
      "sync_connection",
      undefined,
      "sync_connection",
    )) as BrowserSyncConnection | null;
    const deviceId = existing?.deviceId ?? dependencies.createDeviceId();
    const provisioned = await dependencies.provision(token, deviceId);
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
        baseUrl: dependencies.baseUrl(),
        workspaceId: provisioned.workspaceId,
        deviceId,
      },
      "sync_status",
    )) as WorkspaceSyncStatus;
    active = true;
    openPushChannel({ workspaceId: provisioned.workspaceId, deviceId, token });
    schedule(0);
    return connected;
  }

  /**
   * One startup attempt to reopen sync from a persisted session. Only a
   * workspace with a durable cloud connection resumes; linking a workspace
   * remains an explicit user action. The server stays the authority: a
   * rejected credential clears the persisted session and the workspace
   * degrades to `authenticationRequired`, while transient failures keep the
   * session for the next interactive retry.
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
      if (!(error instanceof SyncSessionRejectedError)) {
        console.error("cloud sync resume failed", error);
      }
      return status();
    }
  }

  async function pause(): Promise<WorkspaceSyncStatus> {
    active = false;
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
    wakeRequested = false;
    clearScheduled();
    teardownPushChannel();
  }

  async function retry(): Promise<WorkspaceSyncStatus> {
    if (active) schedule(0);
    return status();
  }

  function notifyLocalCommit(): void {
    if (active) schedule(0);
  }

  function wake(): void {
    if (active) schedule(0);
  }

  return { status, connect, resume, pause, stop, retry, notifyLocalCommit, wake };
}

const progressListeners = new Set<(progress: BrowserSyncProgress) => void>();
const workspaceChangeListeners = new Set<() => void>();
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

export function subscribeBrowserWorkspaceChanges(listener: () => void): () => void {
  workspaceChangeListeners.add(listener);
  return () => workspaceChangeListeners.delete(listener);
}

function publishBrowserWorkspaceChange(): void {
  for (const listener of workspaceChangeListeners) listener();
}

async function provisionBrowserDevice(
  token: string,
  deviceId: string,
): Promise<ProvisionedWorkspace> {
  const response = await fetch(`${trustedCloudBaseUrl()}/v1/sync/provision`, {
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
 * capped reconnect: correctness always comes from the polled sync cycle.
 */
function openBrowserPushChannel(
  connection: PushChannelConnection,
  onWake: () => void,
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
      trustedCloudBaseUrl().replace(/^http/, "ws") +
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
  window.addEventListener("online", () => driver.wake());
  window.addEventListener("focus", () => driver.wake());
  return sharedDriver;
}
