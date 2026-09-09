import { useEffect, useState } from "react";
import {
  enableWorkspaceEncryption,
  unlockWorkspaceEncryption,
  workspaceEncryptionState,
  type WorkspaceEncryptionState,
  type WorkspaceSyncStatus,
} from "@/bridge/commands";
import { InlineConfirm } from "@/shared/ui/inline-confirm";
import {
  settingsButton,
  settingsGroup,
  settingsGroupHint,
  settingsGroupTitle,
  settingsRow,
  settingsRowDescription,
  settingsRowLabel,
  settingsTextInput,
} from "./settings-shared";
import {
  encryptionDescription,
  encryptionStage,
  normalizeRecoveryCodeInput,
  recoveryCodeLooksComplete,
} from "./sync-encryption";

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
    <div className={settingsGroup}>
      <div className={settingsGroupTitle}>End-to-end encryption</div>
      <div className={settingsRow}>
        <span className={settingsRowLabel}>
          {stage === "on" || stage === "revealed" ? "Encrypted" : "Not encrypted"}
          <span className={settingsRowDescription}>{encryptionDescription(stage)}</span>
          {state?.keyId ? (
            <span className={settingsRowDescription}>Key {state.keyId}</span>
          ) : null}
        </span>
        {stage === "off" ? (
          <InlineConfirm
            confirmLabel={busy ? "Encrypting…" : "Show my recovery code"}
            message="The code is shown once. Without it, the cloud copy cannot be opened again."
            messagePlacement="stacked"
            renderIdle={(arm) => (
              <button type="button" className={settingsButton} disabled={busy} onClick={arm}>
                Encrypt this workspace
              </button>
            )}
            onConfirm={() => void enable()}
          />
        ) : null}
      </div>
      {stage === "revealed" && recoveryCode ? (
        <div className={settingsRow}>
          <span className={settingsRowLabel}>
            Recovery code
            <code className="mt-1 block font-mono text-sm tracking-widest">{recoveryCode}</code>
            <span className={settingsRowDescription}>
              Losing it means losing the cloud copy. The notes on this device are unaffected.
            </span>
          </span>
          <button
            type="button"
            className={settingsButton}
            onClick={() => {
              setRecoveryCode(null);
            }}
          >
            I wrote it down
          </button>
        </div>
      ) : null}
      {stage === "locked" ? (
        <div className={settingsRow}>
          <span className={settingsRowLabel}>
            Recovery code
            <span className={settingsRowDescription}>
              Enter the code this workspace showed when encryption was turned on.
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            <input
              className={settingsTextInput}
              value={entered}
              spellCheck={false}
              autoComplete="off"
              aria-label="Workspace recovery code"
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
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="m-0 py-1.5 text-[11px] text-destructive">
          {error}
        </p>
      ) : null}
      {stage === "on" && state?.sealedCheckpointAt === null ? (
        <div className={settingsGroupHint}>
          Changes made before encryption was turned on stay in the cloud until the next encrypted
          checkpoint replaces them. Keep this device online until sync reports it is up to date.
        </div>
      ) : null}
    </div>
  );
}
