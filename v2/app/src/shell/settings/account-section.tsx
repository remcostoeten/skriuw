import { useEffect, useState } from "react";
import { AuthDrawer, AuthProvider, useAuth } from "@remcostoeten/auth-drawer";
import { authAdapter } from "../../auth/adapter";
import { authConfiguration } from "../../auth/config";
import { currentSessionToken } from "../../auth/session-token";
import {
  type BlockedSyncOperation,
  connectWorkspaceSync,
  discardBlockedSyncOperation,
  listBlockedSyncOperations,
  pauseWorkspaceSync,
  retryBlockedSyncOperation,
  retryWorkspaceSync,
  type SyncRecoveryView,
  type WorkspaceSyncStatus,
  workspaceSyncStatus,
} from "../../bridge/commands";
import { isBrowserRuntime } from "../../bridge/runtime";
import { formatRelativeTime } from "../../shared/lib/relative-time";
import { InlineConfirm } from "../../shared/ui/inline-confirm";
import {
  SettingsHeading,
  settingsButton,
  settingsButtonDanger,
  settingsGroup,
  settingsGroupTitle,
  settingsRow,
  settingsRowDescription,
  settingsRowLabel,
  settingsSection,
} from "./settings-shared";
import {
  blockedCauseText,
  blockedItemLabel,
  blockedItemRetryable,
  blockedStateText,
} from "./sync-recovery";

function AccountContent() {
  const { user, isPending, openDrawer, signOut } = useAuth();
  const [syncStatus, setSyncStatus] = useState<WorkspaceSyncStatus>({ state: "localOnly" });
  const [syncPending, setSyncPending] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<SyncRecoveryView | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoveryBusyId, setRecoveryBusyId] = useState<string | null>(null);
  const unavailableReason = authConfiguration.available ? null : authConfiguration.reason;
  const browser = isBrowserRuntime();

  useEffect(() => {
    if (!user || browser) return;
    let mounted = true;
    const refresh = () => {
      void workspaceSyncStatus().then((status) => {
        if (mounted) setSyncStatus(status);
      });
    };
    refresh();
    const interval = window.setInterval(refresh, 2_000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [browser, user]);

  useEffect(() => {
    if (!user || browser) return;
    let mounted = true;
    const load = () => {
      listBlockedSyncOperations().then(
        (view) => {
          if (!mounted) return;
          setRecovery(view);
          setRecoveryError(null);
        },
        (error: unknown) => {
          if (mounted) setRecoveryError(error instanceof Error ? error.message : String(error));
        },
      );
    };
    load();
    const interval = window.setInterval(load, 10_000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [browser, user]);

  async function resolveBlocked(
    action: (blockedId: string) => Promise<SyncRecoveryView>,
    blockedId: string,
  ) {
    setRecoveryBusyId(blockedId);
    setRecoveryError(null);
    try {
      setRecovery(await action(blockedId));
      setSyncStatus(await workspaceSyncStatus());
    } catch (error) {
      setRecoveryError(error instanceof Error ? error.message : String(error));
    } finally {
      setRecoveryBusyId(null);
    }
  }

  async function retrySyncNow() {
    setSyncPending(true);
    setSyncError(null);
    try {
      setSyncStatus(await retryWorkspaceSync());
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : String(error));
    } finally {
      setSyncPending(false);
    }
  }

  async function enableSync() {
    setSyncPending(true);
    setSyncError(null);
    try {
      const token = await currentSessionToken();
      if (!token) throw new Error("Your session is unavailable. Sign in again.");
      setSyncStatus(await connectWorkspaceSync(token));
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : String(error));
    } finally {
      setSyncPending(false);
    }
  }

  async function pauseSync() {
    setSyncPending(true);
    setSyncError(null);
    try {
      setSyncStatus(await pauseWorkspaceSync());
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : String(error));
    } finally {
      setSyncPending(false);
    }
  }

  async function signOutSafely() {
    if (!browser) await pauseWorkspaceSync().catch(() => undefined);
    await signOut();
    setSyncStatus({ state: "localOnly" });
  }

  return (
    <section aria-label="Account" className={settingsSection}>
      <SettingsHeading
        title="Account"
        detail="Sign in for cloud capabilities. Your local workspace remains available without an account."
      />
      <div className={settingsGroup}>
        <div className={settingsGroupTitle}>Skriuw cloud</div>
        <div className={settingsRow}>
          <span className={settingsRowLabel}>
            {user ? user.name || user.email : "Not signed in"}
            <span className={settingsRowDescription}>
              {user
                ? user.email
                : unavailableReason ?? "Use email and password to sign in or create an account."}
            </span>
          </span>
          {user ? (
            <button type="button" className={settingsButton} onClick={() => void signOutSafely()}>
              Sign out
            </button>
          ) : (
            <button
              type="button"
              className={settingsButton}
              disabled={isPending || unavailableReason !== null}
              onClick={openDrawer}
            >
              {isPending ? "Checking…" : "Sign in"}
            </button>
          )}
        </div>
        {user ? (
          <div className={settingsRow}>
            <span className={settingsRowLabel}>
              Workspace sync
              <span className={settingsRowDescription}>
                {syncError ?? syncDescription(syncStatus, browser)}
              </span>
            </span>
            {!browser ? (
              syncEnabled(syncStatus) ? (
                <span className="flex items-center gap-1.5">
                  {syncStatus.state === "blocked" ? (
                    <button
                      type="button"
                      className={settingsButton}
                      disabled={syncPending}
                      onClick={() => void retrySyncNow()}
                    >
                      {syncPending ? "Retrying…" : "Retry sync"}
                    </button>
                  ) : null}
                  <button type="button" className={settingsButton} disabled={syncPending} onClick={() => void pauseSync()}>
                    {syncPending ? "Pausing…" : "Pause sync"}
                  </button>
                </span>
              ) : (
                <button type="button" className={settingsButton} disabled={syncPending} onClick={() => void enableSync()}>
                  {syncPending ? "Connecting…" : "Enable sync"}
                </button>
              )
            ) : null}
          </div>
        ) : null}
      </div>
      {user && !browser ? (
        <BlockedChanges
          recovery={recovery}
          error={recoveryError}
          busyId={recoveryBusyId}
          onRetry={(blockedId) => void resolveBlocked(retryBlockedSyncOperation, blockedId)}
          onDiscard={(blockedId) => void resolveBlocked(discardBlockedSyncOperation, blockedId)}
        />
      ) : null}
    </section>
  );
}

type BlockedChangesProps = {
  recovery: SyncRecoveryView | null;
  error: string | null;
  busyId: string | null;
  onRetry: (blockedId: string) => void;
  onDiscard: (blockedId: string) => void;
};

function BlockedChanges({ recovery, error, busyId, onRetry, onDiscard }: BlockedChangesProps) {
  const blocked = recovery?.blocked ?? [];
  const discarded = recovery?.discarded ?? [];
  if (!error && blocked.length === 0 && discarded.length === 0) return null;
  return (
    <>
      {error || blocked.length > 0 ? (
        <div className={settingsGroup} role="region" aria-label="Blocked sync changes">
          <div className={settingsGroupTitle}>Blocked changes</div>
          {error ? (
            <p role="alert" className="m-0 py-1.5 text-[11px] text-destructive">
              {error}
            </p>
          ) : null}
          <ul className="m-0 list-none p-0" aria-live="polite">
            {blocked.map((item) => (
              <BlockedChangeRow
                key={item.blockedId}
                item={item}
                busyId={busyId}
                onRetry={onRetry}
                onDiscard={onDiscard}
              />
            ))}
          </ul>
        </div>
      ) : null}
      {discarded.length > 0 ? (
        <div className={settingsGroup} role="region" aria-label="Discarded sync changes">
          <div className={settingsGroupTitle}>Discarded changes</div>
          <ul className="m-0 list-none p-0">
            {discarded.map((item) => (
              <li key={item.blockedId} className={settingsRow}>
                <span className={settingsRowLabel}>
                  {blockedItemLabel(item)}
                  <span className={settingsRowDescription}>
                    Discarded {formatRelativeTime(item.discardedAt)}; it never uploaded and
                    other devices will not receive it.
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}

type BlockedChangeRowProps = {
  item: BlockedSyncOperation;
  busyId: string | null;
  onRetry: (blockedId: string) => void;
  onDiscard: (blockedId: string) => void;
};

function BlockedChangeRow({ item, busyId, onRetry, onDiscard }: BlockedChangeRowProps) {
  return (
    <li className={settingsRow}>
      <span className={settingsRowLabel}>
        {blockedItemLabel(item)}
        <span className={settingsRowDescription}>
          {blockedCauseText(item.reasonCode)} Blocked {formatRelativeTime(item.firstBlockedAt)}.
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        {blockedItemRetryable(item.reasonCode) ? (
          <button
            type="button"
            className={settingsButton}
            disabled={busyId !== null}
            onClick={() => onRetry(item.blockedId)}
          >
            {busyId === item.blockedId ? "Retrying…" : "Retry"}
          </button>
        ) : null}
        <InlineConfirm
          size="sm"
          confirmLabel="Discard change"
          message="It will never reach your other devices."
          onConfirm={() => onDiscard(item.blockedId)}
          renderIdle={(arm) => (
            <button
              type="button"
              className={`${settingsButton} ${settingsButtonDanger}`}
              disabled={busyId !== null}
              onClick={arm}
            >
              Discard…
            </button>
          )}
        />
      </span>
    </li>
  );
}

function syncEnabled(status: WorkspaceSyncStatus): boolean {
  return status.state !== "localOnly" && status.state !== "authenticationRequired";
}

function syncDescription(status: WorkspaceSyncStatus, browser: boolean): string {
  if (browser) return "Browser workspaces stay fully local for now; account sync is available in the desktop app.";
  switch (status.state) {
    case "localOnly": return "Off. Notes stay only on this device until you enable sync.";
    case "connecting": return "Connecting this device securely…";
    case "upToDate": return "Up to date with your private cloud workspace.";
    case "pending": return "Local changes are waiting to upload.";
    case "offline": return "Offline. Changes remain local and will retry automatically.";
    case "authenticationRequired": return "Paused. Enable sync again after signing in.";
    case "conflict": return `${status.openConflicts} sync conflict${status.openConflicts === 1 ? "" : "s"} need attention.`;
    case "retrying": return "Cloud is temporarily unavailable; retrying automatically.";
    case "blocked": return blockedStateText(status.reason);
  }
}

export function AccountSection() {
  return (
    <AuthProvider adapter={authAdapter}>
      <AccountContent />
      <AuthDrawer
        adapter={authAdapter}
        hideTrigger
        config={{
          ui: {
            auth: {
              providers: [],
              allowRegister: true,
              showForgotPassword: false,
              showRememberMe: true,
            },
            presentation: { variant: "modal" },
          },
        }}
      />
    </AuthProvider>
  );
}
