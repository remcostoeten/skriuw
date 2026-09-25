import { useEffect, useState, useSyncExternalStore } from "react";
import { useAuth } from "@remcostoeten/auth-drawer";
import { connectSyncForCurrentSession } from "@/features/auth/connect-sync";
import {
  clearConnectFailure,
  connectFailureDescription,
  connectFailureText,
  latestConnectFailure,
  reportConnectFailure,
  subscribeConnectFailure,
} from "@/features/auth/connect-state";
import {
  type BrowserSyncProgress,
  latestBrowserResumeFailure,
  latestBrowserSyncProgress,
  subscribeBrowserResumeFailure,
  subscribeBrowserSyncProgress,
} from "@/bridge/browser-sync";
import { pauseWorkspaceSync, retryWorkspaceSync, workspaceSyncStatus } from "@/bridge/commands";
import type { WorkspaceSyncStatus } from "@skriuw/renderer-core/bridge/port";
import { isBrowserRuntime } from "@/bridge/runtime";

/** Cadence for a surface the user is actively watching, such as the settings row. */
export const SYNC_POLL_ACTIVE_MS = 2_000;

/**
 * Cadence for the always-mounted rail status dot. It only has to stay roughly
 * current, so it must not cost a status round trip every two seconds for the
 * entire life of the window.
 */
export const SYNC_POLL_AMBIENT_MS = 15_000;

const RECONNECT_BASE_MS = 5_000;
const RECONNECT_MAX_MS = 60_000;

const reconnect = { userId: null as string | null, failures: 0, inFlight: false };

function reconnectDelayMs(userId: string): number {
  if (reconnect.userId !== userId) return 0;
  if (reconnect.failures === 0) return 0;
  return Math.min(RECONNECT_BASE_MS * 2 ** (reconnect.failures - 1), RECONNECT_MAX_MS);
}

/**
 * Connects a signed-in workspace that is not linked yet, backing off between
 * failures. Shared across every mounted `useWorkspaceSync` so the rail and the
 * settings row never race two connects.
 */
async function reconnectInBackground(userId: string): Promise<boolean> {
  if (reconnect.userId !== userId) {
    reconnect.userId = userId;
    reconnect.failures = 0;
  }
  if (reconnect.inFlight) return false;
  reconnect.inFlight = true;
  try {
    await connectSyncForCurrentSession();
    clearConnectFailure();
    reconnect.failures = 0;
    return true;
  } catch (reason) {
    reportConnectFailure(reason);
    reconnect.failures += 1;
    return false;
  } finally {
    reconnect.inFlight = false;
  }
}

function subscribeProgress(onStoreChange: () => void): () => void {
  return subscribeBrowserSyncProgress(() => onStoreChange());
}

function subscribeNever(): () => void {
  return () => undefined;
}

function readNoProgress(): BrowserSyncProgress | null {
  return null;
}

function readNoResumeFailure(): string | null {
  return null;
}

export type WorkspaceSync = {
  status: WorkspaceSyncStatus;
  pending: boolean;
  /** Action or connect failure text; replaces the status description while set. */
  error: string | null;
  progress: BrowserSyncProgress | null;
  browser: boolean;
  /** The session is dead: every surface offers sign-in, whatever the session hook says. */
  signInRequired: boolean;
  retry: () => void;
  /** Pauses sync before ending the session, so no push races the sign-out. */
  signOut: () => void;
  refresh: () => Promise<void>;
};

/**
 * Live workspace sync state plus the actions that change it. Shared by the
 * settings account section and the rail account menu so both read one status
 * and cannot drift; polling only runs while a session exists.
 */
export function useWorkspaceSync(pollIntervalMs = SYNC_POLL_ACTIVE_MS): WorkspaceSync {
  const { user, signOut } = useAuth();
  const [status, setStatus] = useState<WorkspaceSyncStatus>({ state: "localOnly" });
  const [statusPolled, setStatusPolled] = useState(false);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const browser = isBrowserRuntime();
  const progress = useSyncExternalStore(
    browser ? subscribeProgress : subscribeNever,
    browser ? latestBrowserSyncProgress : readNoProgress,
  );
  const connectFailure = useSyncExternalStore(subscribeConnectFailure, latestConnectFailure);
  const resumeFailure = useSyncExternalStore(
    browser ? subscribeBrowserResumeFailure : subscribeNever,
    browser ? latestBrowserResumeFailure : readNoResumeFailure,
  );

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    let inFlight = false;
    function poll() {
      if (inFlight) return;
      inFlight = true;
      void workspaceSyncStatus()
        .then(
          (latest) => {
            if (!mounted) return;
            setStatus(latest);
            setStatusPolled(true);
            if (latest.state !== "localOnly") clearConnectFailure();
          },
          (reason: unknown) => {
            if (mounted) setActionError(connectFailureText(reason));
          },
        )
        .finally(() => {
          inFlight = false;
        });
    }
    poll();
    const interval = window.setInterval(poll, pollIntervalMs);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [pollIntervalMs, user]);

  async function run(action: () => Promise<WorkspaceSyncStatus>): Promise<void> {
    setPending(true);
    setActionError(null);
    try {
      setStatus(await action());
    } catch (reason) {
      setActionError(connectFailureText(reason));
    } finally {
      setPending(false);
    }
  }

  const userId = user?.id ?? null;
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const shouldReconnect =
    userId !== null && statusPolled && status.state === "localOnly" && !pending;
  useEffect(() => {
    if (!shouldReconnect || userId === null) return;
    const timer = window.setTimeout(() => {
      void reconnectInBackground(userId).then((connected) => {
        if (connected) void workspaceSyncStatus().then(setStatus, () => undefined);
        else setReconnectAttempt((attempt) => attempt + 1);
      });
    }, reconnectDelayMs(userId));
    return () => window.clearTimeout(timer);
  }, [shouldReconnect, userId, reconnectAttempt]);

  async function signOutSafely(): Promise<void> {
    await pauseWorkspaceSync().catch(() => undefined);
    await signOut();
    setStatus({ state: "localOnly" });
  }

  // A failed connect leaves sync paused either way: `localOnly` when the
  // workspace was never linked, `authenticationRequired` when it was. Reporting
  // only the first hid every real reason behind the generic "session ended"
  // description on a workspace that had synced before.
  const stopped = status.state === "localOnly" || status.state === "authenticationRequired";
  const stoppedReason = connectFailure ?? resumeFailure;
  const error =
    actionError ??
    (stoppedReason !== null && stopped ? connectFailureDescription(stoppedReason) : null);

  return {
    status,
    pending,
    error,
    progress,
    browser,
    signInRequired: status.state === "authenticationRequired",
    retry: () => void run(retryWorkspaceSync),
    signOut: () => void signOutSafely(),
    refresh: async () => {
      setStatus(await workspaceSyncStatus());
    },
  };
}
