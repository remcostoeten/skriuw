import { useEffect, useState, useSyncExternalStore } from "react";
import { useAuth } from "@remcostoeten/auth-drawer";
import { currentSessionToken } from "../../auth/session-token";
import {
  type BrowserSyncProgress,
  latestBrowserSyncProgress,
  subscribeBrowserSyncProgress,
} from "../../bridge/browser-sync";
import {
  connectWorkspaceSync,
  pauseWorkspaceSync,
  retryWorkspaceSync,
  type WorkspaceSyncStatus,
  workspaceSyncStatus,
} from "../../bridge/commands";
import { isBrowserRuntime } from "../../bridge/runtime";

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

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export type WorkspaceSync = {
  status: WorkspaceSyncStatus;
  pending: boolean;
  error: string | null;
  progress: BrowserSyncProgress | null;
  browser: boolean;
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
  const [error, setError] = useState<string | null>(null);
  const browser = isBrowserRuntime();
  const progress = useSyncExternalStore(
    browser ? subscribeProgress : subscribeNever,
    browser ? latestBrowserSyncProgress : readNoProgress,
  );

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
            if (mounted) setStatus(next);
          },
          (reason: unknown) => {
            if (mounted) setError(errorText(reason));
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
    setError(null);
    try {
      setStatus(await action());
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setPending(false);
    }
  }

  async function resumeSync(): Promise<void> {
    await run(async () => {
      const token = await currentSessionToken();
      if (!token) throw new Error("Your session is unavailable. Sign in again.");
      return connectWorkspaceSync(token);
    });
  }

  async function signOutSafely(): Promise<void> {
    await pauseWorkspaceSync().catch(() => undefined);
    await signOut();
    setStatus({ state: "localOnly" });
  }

  return {
    status,
    pending,
    error,
    progress,
    browser,
    retry: () => void run(retryWorkspaceSync),
    resume: () => void resumeSync(),
    pause: () => void run(pauseWorkspaceSync),
    signOut: () => void signOutSafely(),
    refresh: async () => {
      setStatus(await workspaceSyncStatus());
    },
  };
}
