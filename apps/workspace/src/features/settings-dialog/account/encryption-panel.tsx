import { settingsCopy } from "@/shared/ui/settings-copy";
import { useEffect, useState } from "react";
import {
  enableWorkspaceEncryption,
  unlockWorkspaceEncryption,
  workspaceEncryptionState,
  type WorkspaceEncryptionState,
} from "@/platform/runtime/commands";
import type { WorkspaceSyncStatus } from "@skriuw/renderer-core/bridge/port";
import { InlineConfirm } from "@/shared/ui/inline-confirm";
import {
  SettingsGroup,
  SettingsRow,
  settingsButton,
  settingsRowDescription,
  settingsTextInput,
} from "@/shared/ui/settings-controls";
import { encryptionDescription, encryptionStage } from "@/features/sync/encryption";
import { normalizeRecoveryCodeInput, recoveryCodeLooksComplete } from "@/shared/text/recovery-code";

type Props = {
  status: WorkspaceSyncStatus;
};

export function SyncEncryptionPanel({ status }: Props) {
  const [state, setState] = useState<WorkspaceEncryptionState | null>(null);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [entered, setEntered] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    workspaceEncryptionState().then(
      (loaded) => {
        if (mounted) setState(loaded);
      },
      (failure: unknown) => {
        if (mounted) setError(failure instanceof Error ? failure.message : String(failure));
      },
    );
    return () => {
      mounted = false;
    };
  }, [status.state]);

  const stage = encryptionStage(state, status, recoveryCode);

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      const code = await enableWorkspaceEncryption();
      setRecoveryCode(code);
      setState(await workspaceEncryptionState());
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  }

  async function unlock() {
    setBusy(true);
    setError(null);
    try {
      setState(await unlockWorkspaceEncryption(entered));
      setEntered("");
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsGroup
      id="encryption"
      title="End-to-end encryption"
      hint={
        stage === "on" && state?.sealedCheckpointAt === null
          ? settingsCopy.account.changesMadeBeforeEncryptionWasTurned
          : undefined
      }
      keywords="encryption end-to-end recovery code key"
    >
      <SettingsRow
        label={stage === "on" || stage === "revealed" ? "Encrypted" : "Not encrypted"}
        detail={encryptionDescription(stage)}
        notes={
          state?.keyId ? <span className={settingsRowDescription}>Key {state.keyId}</span> : null
        }
      >
        {stage === "off" ? (
          <InlineConfirm
            confirmLabel={busy ? "Encrypting…" : settingsCopy.account.showMyRecoveryCode}
            message={settingsCopy.account.theCodeIsShownOnceWithout}
            messagePlacement="stacked"
            renderIdle={(arm) => (
              <button type="button" className={settingsButton} disabled={busy} onClick={arm}>
                {settingsCopy.account.encryptThisWorkspace}
              </button>
            )}
            onConfirm={() => void enable()}
          />
        ) : null}
      </SettingsRow>
      {stage === "revealed" && recoveryCode ? (
        <SettingsRow
          label="Recovery code"
          notes={
            <>
              <code className="mt-1 block font-mono text-sm tracking-widest">{recoveryCode}</code>
              <span className={settingsRowDescription}>
                {settingsCopy.account.losingItMeansLosingTheCloud}
              </span>
            </>
          }
        >
          <button
            type="button"
            className={settingsButton}
            onClick={() => {
              setRecoveryCode(null);
            }}
          >
            {settingsCopy.account.iWroteItDown}
          </button>
        </SettingsRow>
      ) : null}
      {stage === "locked" ? (
        <SettingsRow
          label="Recovery code"
          detail={settingsCopy.account.enterTheCodeThisWorkspaceShowed}
        >
          <span className="flex items-center gap-1.5">
            <input
              className={settingsTextInput}
              value={entered}
              spellCheck={false}
              autoComplete="off"
              aria-label={settingsCopy.account.workspaceRecoveryCode}
              placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
              onChange={(event) => {
                setEntered(normalizeRecoveryCodeInput(event.target.value));
              }}
            />
            <button
              type="button"
              className={settingsButton}
              disabled={busy || !recoveryCodeLooksComplete(entered)}
              onClick={() => void unlock()}
            >
              {busy ? "Unlocking…" : "Unlock"}
            </button>
          </span>
        </SettingsRow>
      ) : null}
      {error ? (
        <p role="alert" className="m-0 py-1.5 text-[11px] text-destructive">
          {error}
        </p>
      ) : null}
    </SettingsGroup>
  );
}
