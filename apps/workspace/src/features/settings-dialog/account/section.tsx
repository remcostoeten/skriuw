import { settingsCopy } from "@/shared/ui/settings-copy";
import { useEffect, useState } from "react";
import { useCloudSession } from "@/features/auth/cloud-session";
import { authConfiguration } from "@/features/auth/config";
import {
  activeWorkspaceSlot,
  clearAllData,
  discardBlockedSyncOperation,
  listBlockedSyncOperations,
  pauseWorkspaceSync,
  retryBlockedSyncOperation,
} from "@/platform/runtime/commands";
import type { BlockedSyncOperation, SyncRecoveryView } from "@skriuw/renderer-core/bridge/port";
import { formatRelativeTime } from "@/shared/format/relative-time";
import { InlineConfirm } from "@/shared/ui/inline-confirm";
import { AccountAvatar } from "@/features/auth/account-avatar";
import { accountInitials } from "@/features/auth/account-identity";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import {
  SettingToggle,
  SettingsGroup,
  SettingsRow,
  settingsButton,
  settingsButtonDanger,
  settingsRowDescription,
  settingsSection,
} from "@/shared/ui/settings-controls";
import { useEditableSettings } from "@/features/settings/use-editable-settings";
import {
  blockedCauseText,
  blockedItemLabel,
  blockedItemRetryable,
} from "@/features/sync/blocked-operations";
import {
  syncDescription,
  syncDetail,
  syncProgressText,
  syncProgressVisible,
} from "@/features/sync/status";
import { SyncEncryptionPanel } from "./encryption-panel";
import { useWorkspaceSync } from "@/features/sync/use-workspace-sync";
import { shortWorkspaceId, workspaceOwnershipText } from "./workspace-ownership";
import { deleteCloudAccount } from "@/features/auth/delete-account";
import { accountLifecycle } from "@/features/auth/account-lifecycle";

type AccountSectionProps = {
  store: RendererStore;
  /** Closes settings and opens the shell-level sign-in drawer; the drawer cannot render inside this modal dialog. */
  onRequestSignIn: () => void;
};

export function AccountSection({ store, onRequestSignIn }: AccountSectionProps) {
  const { user, isPending } = useCloudSession();
  const sync = useWorkspaceSync();
  const [recovery, setRecovery] = useState<SyncRecoveryView | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoveryBusyId, setRecoveryBusyId] = useState<string | null>(null);
  const [workspaceSlot, setWorkspaceSlot] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const unavailableReason = authConfiguration.available ? null : authConfiguration.reason;
  const browser = sync.browser;
  /** Encryption is a property of a linked workspace, so it waits for sync. */
  const signedIn = user !== null && !sync.signInRequired;

  useEffect(() => {
    let mounted = true;
    activeWorkspaceSlot().then(
      (slot) => {
        if (mounted) setWorkspaceSlot(slot);
      },
      (error: unknown) => {
        console.error(settingsCopy.account.couldNotReadTheActiveWorkspace, error);
      },
    );
    return () => {
      mounted = false;
    };
  }, [user, sync.status.state]);

  useEffect(() => {
    if (!user || browser) return;
    let mounted = true;
    function load() {
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
    }
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

  async function deleteAccountAndData() {
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await accountLifecycle().flushPendingWork();
      await pauseWorkspaceSync();
      await deleteCloudAccount();
      await clearAllData();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : String(error));
      setDeleteBusy(false);
    }
  }

  return (
    <section aria-label="Account" className={settingsSection}>
      <SettingsGroup
        id="cloud"
        title="Skriuw cloud"
        keywords="sign in sign up register email password session sync"
      >
        <SettingsRow
          label={user ? user.name || user.email : settingsCopy.account.notSignedIn}
          detail={
            user
              ? user.email
              : (unavailableReason ?? settingsCopy.account.useEmailAndPasswordToSign)
          }
        >
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
        </SettingsRow>
        <SettingsRow
          label={settingsCopy.account.notesOnThisDevice}
          detail={workspaceOwnershipText(workspaceSlot, user !== null)}
          notes={
            workspaceSlot !== null ? (
              <span className={settingsRowDescription}>
                Workspace {shortWorkspaceId(workspaceSlot)}
              </span>
            ) : null
          }
        />
        {user ? (
          <SettingsRow
            label="Workspace sync"
            detail={sync.error ?? syncDescription(sync.status, browser)}
            notes={
              <>
                {syncDetail(sync.status) ? (
                  <span className={settingsRowDescription}>{syncDetail(sync.status)}</span>
                ) : null}
                {browser ? (
                  <span aria-live="polite" className={settingsRowDescription}>
                    {sync.progress && syncProgressVisible(sync.status, sync.pending)
                      ? syncProgressText(sync.progress)
                      : null}
                  </span>
                ) : null}
              </>
            }
          >
            {sync.signInRequired ? (
              <button
                type="button"
                className={settingsButton}
                disabled={unavailableReason !== null}
                onClick={onRequestSignIn}
              >
                Sign in
              </button>
            ) : sync.status.state === "blocked" ? (
              <button
                type="button"
                className={settingsButton}
                disabled={sync.pending}
                onClick={sync.retry}
              >
                {sync.pending ? "Retrying…" : "Retry sync"}
              </button>
            ) : null}
          </SettingsRow>
        ) : null}
      </SettingsGroup>
      {user ? (
        <AvatarPreference
          store={store}
          seed={user.id}
          initials={accountInitials(user.name, user.email)}
        />
      ) : null}
      {signedIn ? <SyncEncryptionPanel status={sync.status} /> : null}
      {user && !browser ? (
        <BlockedChanges
          recovery={recovery}
          error={recoveryError}
          busyId={recoveryBusyId}
          onRetry={(blockedId) => void resolveBlocked(retryBlockedSyncOperation, blockedId)}
          onDiscard={(blockedId) => void resolveBlocked(discardBlockedSyncOperation, blockedId)}
        />
      ) : null}
      {user ? (
        <SettingsGroup id="delete" title="Delete account" tone="danger">
          <SettingsRow
            label={settingsCopy.account.deleteAccountAndAllData}
            detail={settingsCopy.account.permanentlyDeletesYourCloudAccountSynced}
            notes={
              deleteError ? (
                <span className="text-[11px] text-destructive" role="alert">
                  {deleteError}
                </span>
              ) : null
            }
          >
            <InlineConfirm
              className="shrink-0"
              confirmLabel={deleteBusy ? "Deleting…" : "Delete account"}
              message={settingsCopy.account.thisPermanentlyRemovesYourCloudAccount}
              messagePlacement="stacked"
              onConfirm={() => void deleteAccountAndData()}
              renderIdle={(arm) => (
                <button
                  type="button"
                  className={`${settingsButton} ${settingsButtonDanger}`}
                  disabled={deleteBusy}
                  onClick={arm}
                >
                  Delete…
                </button>
              )}
            />
          </SettingsRow>
        </SettingsGroup>
      ) : null}
    </section>
  );
}

type AvatarPreferenceProps = {
  store: RendererStore;
  seed: string;
  initials: string;
};

function AvatarPreference({ store, seed, initials }: AvatarPreferenceProps) {
  const { settings, change, changed } = useEditableSettings(store);
  return (
    <SettingsGroup
      id="avatar"
      title="Avatar"
      preview={
        <span
          className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-border bg-theme-active text-[11px] font-medium tracking-[0.02em] text-foreground"
          aria-hidden="true"
        >
          <AccountAvatar seed={seed} initials={initials} facehash={settings.facehashAvatar} />
        </span>
      }
    >
      <SettingToggle
        label="Facehash avatar"
        detail={settingsCopy.account.showTheFaceGeneratedForYour}
        checked={settings.facehashAvatar}
        changed={changed("facehashAvatar")}
        onChange={(checked) => change("facehashAvatar", checked)}
      />
    </SettingsGroup>
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
        <SettingsGroup id="blocked" title="Blocked changes">
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
        </SettingsGroup>
      ) : null}
      {discarded.length > 0 ? (
        <SettingsGroup id="discarded" title="Discarded changes">
          <ul className="m-0 list-none p-0">
            {discarded.map((item) => (
              <SettingsRow
                key={item.blockedId}
                as="li"
                label={blockedItemLabel(item)}
                detail={
                  <>
                    Discarded {formatRelativeTime(item.discardedAt)}
                    {settingsCopy.account.ItNeverUploadedAndOther}
                  </>
                }
              />
            ))}
          </ul>
        </SettingsGroup>
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
    <SettingsRow
      as="li"
      label={blockedItemLabel(item)}
      detail={
        <>
          {blockedCauseText(item.reasonCode)} Blocked {formatRelativeTime(item.firstBlockedAt)}.
        </>
      }
    >
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
          message={settingsCopy.account.itWillNeverReachYourOther}
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
    </SettingsRow>
  );
}
