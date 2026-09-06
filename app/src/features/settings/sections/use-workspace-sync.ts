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
  latestBrowserSyncProgress,
  subscribeBrowserSyncProgress,
} from "@/bridge/browser-sync";
import {
  pauseWorkspaceSync,
  retryWorkspaceSync,
  type WorkspaceSyncStatus,
  workspaceSyncStatus,
} from "@/bridge/commands";
import { isBrowserRuntime } from "@/bridge/runtime";
import { showToast } from "@/shared/ui/toast";

/** Cadence for a surface the user is actively watching, such as the settings row. */
export const SYNC_POLL_ACTIVE_MS = 2_000;

/**
 * Cadence for the always-mounted rail status dot. It only has to stay roughly
 * current, so it must not cost a status round trip every two seconds for the
 * entire life of the window.
 */
export const SYNC_POLL_AMBIENT_MS = 15_000;

function subscribeProgress(onStoreChange: () => void): () => void {
  return subscribeBrowserSyncProgress(() => onStoreChange());
}

function subscribeNever(): () => void {
  return () => undefined;
}

function readNoProgress(): BrowserSyncProgress | null {
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
  resume: () => void;
  pause: () => void;
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
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const browser = isBrowserRuntime();
  const progress = useSyncExternalStore(
    browser ? subscribeProgress : subscribeNever,
    browser ? latestBrowserSyncProgress : readNoProgress,
  );
  const connectFailure = useSyncExternalStore(subscribeConnectFailure, latestConnectFailure);

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    let inFlight = false;
    const poll = () => {
      if (inFlight) return;
      inFlight = true;
      void workspaceSyncStatus()
        .then(
          (next) => {
            if (!mounted) return;
            setStatus(next);
            if (next.state !== "localOnly") clearConnectFailure();
          },
          (reason: unknown) => {
            if (mounted) setActionError(connectFailureText(reason));
          },
        )
        .finally(() => {
          inFlight = false;
        });
    };
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

  async function resumeSync(): Promise<void> {
    setPending(true);
    setActionError(null);
    try {
      await connectSyncForCurrentSession();
      clearConnectFailure();
      setStatus(await workspaceSyncStatus());
    } catch (reason) {
      reportConnectFailure(reason);
      showToast({
        message: connectFailureDescription(connectFailureText(reason)),
        durationMs: 10_000,
      });
    } finally {
      setPending(false);
    }
  }

  async function signOutSafely(): Promise<void> {
    await pauseWorkspaceSync().catch(() => undefined);
    await signOut();
    setStatus({ state: "localOnly" });
  }

  const error =
    actionError ??
    (connectFailure !== null && status.state === "localOnly"
      ? connectFailureDescription(connectFailure)
      : null);

  return {
    status,
    pending,
    error,
    progress,
    browser,
    signInRequired: status.state === "authenticationRequired",
    retry: () => void run(retryWorkspaceSync),
    resume: () => void resumeSync(),
    pause: () => void run(pauseWorkspaceSync),
    signOut: () => void signOutSafely(),
    refresh: async () => {
      setStatus(await workspaceSyncStatus());
    },
  };
}
