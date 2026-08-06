import { authConfiguration } from "../auth/config";
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
};

type ProvisionedWorkspace = {
  workspaceId: string;
  deviceId: string;
};

export type BrowserSyncDriverDependencies = {
  port: SyncWorkerPort;
  baseUrl(): string;
  provision(token: string, deviceId: string): Promise<ProvisionedWorkspace>;
  createDeviceId(): string;
  now(): number;
  setTimer(callback: () => void, delayMs: number): unknown;
  clearTimer(handle: unknown): void;
};

export type BrowserSyncDriver = {
  status(): Promise<WorkspaceSyncStatus>;
  connect(token: string): Promise<WorkspaceSyncStatus>;
  pause(): Promise<WorkspaceSyncStatus>;
  retry(): Promise<WorkspaceSyncStatus>;
  notifyLocalCommit(): void;
  wake(): void;
};

export function createBrowserSyncDriver(
  dependencies: BrowserSyncDriverDependencies,
): BrowserSyncDriver {
  let active = false;
  let cycleInFlight = false;
  let wakeRequested = false;
  let timer: unknown = null;

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
      case "localOnly":
        active = false;
        clearScheduled();
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
      scheduleFromReport(report);
    } catch (error) {
      active = false;
      clearScheduled();
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
    return (await dependencies.port.request(
      "sync_status",
      undefined,
      "sync_status",
    )) as WorkspaceSyncStatus;
  }

  async function connect(token: string): Promise<WorkspaceSyncStatus> {
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
      throw new Error("this local workspace is already linked to a different Skriuw account");
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
    schedule(0);
    return connected;
  }

  async function pause(): Promise<WorkspaceSyncStatus> {
    active = false;
    clearScheduled();
    return (await dependencies.port.request(
      "sync_disconnect",
      undefined,
      "sync_status",
    )) as WorkspaceSyncStatus;
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

  return { status, connect, pause, retry, notifyLocalCommit, wake };
}

const progressListeners = new Set<(progress: BrowserSyncProgress) => void>();
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
    throw new Error("your Skriuw session expired; sign in again");
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
  });
  const driver = sharedDriver;
  window.addEventListener("online", () => driver.wake());
  window.addEventListener("focus", () => driver.wake());
  return sharedDriver;
}
