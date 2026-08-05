import { useEffect, useState } from "react";
import { AuthDrawer, AuthProvider, useAuth } from "@remcostoeten/auth-drawer";
import { authAdapter } from "../../auth/adapter";
import { authConfiguration } from "../../auth/config";
import { currentSessionToken } from "../../auth/session-token";
import {
  connectWorkspaceSync,
  pauseWorkspaceSync,
  type WorkspaceSyncStatus,
  workspaceSyncStatus,
} from "../../bridge/commands";
import { isBrowserRuntime } from "../../bridge/runtime";
import {
  SettingsHeading,
  settingsButton,
  settingsGroup,
  settingsGroupTitle,
  settingsRow,
  settingsRowDescription,
  settingsRowLabel,
  settingsSection,
} from "./settings-shared";

function AccountContent() {
  const { user, isPending, openDrawer, signOut } = useAuth();
  const [syncStatus, setSyncStatus] = useState<WorkspaceSyncStatus>({ state: "localOnly" });
  const [syncPending, setSyncPending] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
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
                <button type="button" className={settingsButton} disabled={syncPending} onClick={() => void pauseSync()}>
                  {syncPending ? "Pausing…" : "Pause sync"}
                </button>
              ) : (
                <button type="button" className={settingsButton} disabled={syncPending} onClick={() => void enableSync()}>
                  {syncPending ? "Connecting…" : "Enable sync"}
                </button>
              )
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
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
    case "blocked": return "Sync stopped because the server rejected a local change.";
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
