import type {
  BridgePort,
  SyncRecoveryView,
  WorkspaceSyncStatus,
} from "../../../../shared/renderer-core/src/bridge/port";

/**
 * What this feature needs from the runtime.
 *
 * The replication half is the existing command surface, taken from
 * `BridgePort` rather than restated, so the mobile client cannot drift from
 * the desktop and browser runtimes on shape or naming. What is added is the
 * handful of signals only a phone has: a process that is suspended rather than
 * closed, a wake channel the shell owns because it can only exist in the
 * foreground, and a background entry point that is allowed to be cut short.
 */
export type MobileSyncPort = Pick<
  BridgePort,
  | "workspaceSyncStatus"
  | "connectWorkspaceSync"
  | "pauseWorkspaceSync"
  | "refreshWorkspaceSync"
  | "setWorkspaceSyncOnline"
  | "setWorkspaceSyncVisibility"
  | "listBlockedSyncOperations"
  | "retryBlockedSyncOperation"
  | "discardBlockedSyncOperation"
> & {
  /**
   * The correctness path on resume: clears durable retry delays and runs a
   * cycle now, instead of waiting for a poll or a wake a suspended process
   * never received.
   */
  catchUpWorkspaceSync: () => Promise<WorkspaceSyncStatus>;
  /**
   * Best-effort. A silent push or a scheduled task asked for a cycle; the
   * platform may suspend the process before it finishes, and iOS gives no
   * guarantee the task ran at all.
   */
  backgroundRefreshWorkspaceSync: () => Promise<WorkspaceSyncStatus>;
  /** Where the foreground wake channel connects, or `null` while unconnected. */
  workspaceWakeChannelUrl: () => Promise<string | null>;
  /** Changes the fallback poll cadence only; sync is correct with it down. */
  setWakeChannelConnected: (connected: boolean) => Promise<void>;
  /** The channel saw another device change the workspace. */
  notifyRemoteChange: () => Promise<void>;
};

export type { SyncRecoveryView, WorkspaceSyncStatus };
