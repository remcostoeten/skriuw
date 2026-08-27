import { useEffect, useState } from "react";
import { useAuth } from "@remcostoeten/auth-drawer";
import { authConfiguration } from "@/features/auth/config";
import {
  type BlockedSyncOperation,
  discardBlockedSyncOperation,
  listBlockedSyncOperations,
  listSyncConflicts,
  retryBlockedSyncOperation,
  type SyncConflictReview,
  type SyncRecoveryView,
} from "@/bridge/commands";
import { formatRelativeTime } from "@/shared/lib/relative-time";
import { InlineConfirm } from "@/shared/ui/inline-confirm";
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
import { ConflictReview } from "./conflict-review";
import {
  blockedCauseText,
  blockedItemLabel,
  blockedItemRetryable,
} from "./sync-recovery";
import {
  syncDescription,
  syncEnabled,
  syncProgressText,
  syncProgressVisible,
} from "./sync-status";
import { useWorkspaceSync } from "./use-workspace-sync";

type AccountSectionProps = {
  /** Closes settings and opens the shell-level sign-in drawer; the drawer cannot render inside this modal dialog. */
  onRequestSignIn: () => void;
};

export function AccountSection({ onRequestSignIn }: AccountSectionProps) {
  const { user, isPending } = useAuth();
  const sync = useWorkspaceSync();
  const [recovery, setRecovery] = useState<SyncRecoveryView | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoveryBusyId, setRecoveryBusyId] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<SyncConflictReview | null>(null);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const unavailableReason = authConfiguration.available ? null : authConfiguration.reason;
  const browser = sync.browser;

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
      listSyncConflicts().then(
        (view) => {
          if (!mounted) return;
          setConflicts(view);
          setConflictError(null);
        },
        (error: unknown) => {
          if (mounted) setConflictError(error instanceof Error ? error.message : String(error));
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
      await sync.refresh();
    } catch (error) {
      setRecoveryError(error instanceof Error ? error.message : String(error));
    } finally {
      setRecoveryBusyId(null);
    }
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
            <button type="button" className={settingsButton} onClick={sync.signOut}>
              Sign out
            </button>
          ) : (
            <button
              type="button"
              className={settingsButton}
              disabled={isPending || unavailableReason !== null}
              onClick={onRequestSignIn}
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
                {sync.error ?? syncDescription(sync.status, browser)}
              </span>
              {browser ? (
                <span aria-live="polite" className={settingsRowDescription}>
                  {sync.progress && syncProgressVisible(sync.status, sync.pending)
                    ? syncProgressText(sync.progress)
                    : null}
                </span>
              ) : null}
            </span>
            {syncEnabled(sync.status) ? (
              <span className="flex items-center gap-1.5">
                {sync.status.state === "blocked" ? (
                  <button
                    type="button"
                    className={settingsButton}
                    disabled={sync.pending}
                    onClick={sync.retry}
                  >
                    {sync.pending ? "Retrying…" : "Retry sync"}
                  </button>
                ) : null}
                <button type="button" className={settingsButton} disabled={sync.pending} onClick={sync.pause}>
                  {sync.pending ? "Pausing…" : "Pause sync"}
                </button>
              </span>
            ) : (
              <button type="button" className={settingsButton} disabled={sync.pending} onClick={sync.resume}>
                {sync.pending ? "Connecting…" : "Resume sync"}
              </button>
            )}
          </div>
        ) : null}
      </div>
      {user && !browser ? (
        <ConflictReview
          review={conflicts}
          error={conflictError}
          onResolved={(next) => {
            setConflicts(next);
            setConflictError(null);
            void sync.refresh();
          }}
          onError={setConflictError}
        />
      ) : null}
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
