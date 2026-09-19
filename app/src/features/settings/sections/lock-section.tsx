import { useState } from "react";
import { Select } from "@/shared/ui/select";
import { InlineConfirm } from "@/shared/ui/inline-confirm";
import { cn } from "@/shared/lib/utils";
import { showToast } from "@/shared/ui/toast";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import type { RendererState } from "@skriuw/renderer-core/store/types";
import { requestLockDialog } from "@/features/lock/lock-dialog-controller";
import { AUTO_LOCK_OPTIONS, secretNoun } from "@/features/lock/lock-model";
import type { AutoLockChoice } from "@/features/lock/lock-model";
import {
  relockNotes,
  removeLock,
  requestSessionUnlock,
  withUnlockedSession,
} from "@/features/lock/lock-session";
import {
  SettingToggle,
  SettingsHeading,
  settingsButton,
  settingsButtonDanger,
  settingsGroup,
  settingsGroupTitle,
  settingsRow,
  settingsRowDescription,
  settingsRowLabel,
  settingsSection,
  useEditableSettings,
} from "./settings-shared";
import type { SectionProps } from "./settings-shared";

function selectNoteLock(state: RendererState) {
  return state.noteLock;
}

function lockStatusText(configured: boolean, unlocked: boolean, count: number): string {
  if (!configured) {
    return "No lock set up. Lock a note from its context menu or set one up here.";
  }
  const notes = count === 1 ? "1 locked note" : `${count} locked notes`;
  return unlocked
    ? `${notes}. Unlocked for this session.`
    : `${notes}. Locked until you enter your secret.`;
}

export function LockSection({ store }: SectionProps) {
  const { settings, change } = useEditableSettings(store);
  const lock = useRendererSelector(store, selectNoteLock);
  const [busy, setBusy] = useState(false);
  const noun = secretNoun(lock.kind);

  function run(action: string, work: () => Promise<unknown>): void {
    setBusy(true);
    void work()
      .catch((error: unknown) => {
        showToast({ message: `${action} failed. ${String(error)}` });
      })
      .finally(() => setBusy(false));
  }

  return (
    <section aria-label="Privacy and lock preferences" className={settingsSection}>
      <SettingsHeading
        title="Privacy & lock"
        detail="Lock single notes or whole folders behind one PIN or passphrase. Locked bodies are encrypted on disk and stay out of search, links, tasks, and history until unlocked."
      />
      <div className={settingsGroup}>
        <div className={settingsGroupTitle}>Note lock</div>
        <div className={settingsRow}>
          <span className={settingsRowLabel}>
            {lock.configured ? `${noun.charAt(0).toUpperCase()}${noun.slice(1)} lock` : "Not set up"}
            <span className={settingsRowDescription}>
              {lockStatusText(lock.configured, lock.unlocked, lock.lockedNoteCount)}
            </span>
            {lock.configured && lock.hint ? (
              <span className={settingsRowDescription}>Hint: {lock.hint}</span>
            ) : null}
          </span>
          <span className="flex flex-wrap items-center justify-end gap-1.5">
            {!lock.configured && (
              <button
                type="button"
                className={settingsButton}
                onClick={() => requestLockDialog({ kind: "setup" })}
              >
                Set up lock…
              </button>
            )}
            {lock.configured && !lock.unlocked && (
              <button type="button" className={settingsButton} onClick={requestSessionUnlock}>
                Unlock…
              </button>
            )}
            {lock.configured && lock.unlocked && (
              <button
                type="button"
                className={settingsButton}
                disabled={busy}
                onClick={() => run("Locking", () => relockNotes(store))}
              >
                Lock now
              </button>
            )}
            {lock.configured && (
              <button
                type="button"
                className={settingsButton}
                onClick={() =>
                  withUnlockedSession(store, () => requestLockDialog({ kind: "change" }))
                }
              >
                Change {noun}…
              </button>
            )}
          </span>
        </div>
      </div>
      <div className={settingsGroup}>
        <div className={settingsGroupTitle}>Relocking</div>
        <div className={settingsRow}>
          <span className={settingsRowLabel}>
            Lock again automatically
            <span className={settingsRowDescription}>
              After this long without typing, clicking, or scrolling, locked notes close again.
            </span>
          </span>
          <Select
            label="Auto-lock delay"
            value={String(settings.autoLockMinutes) as AutoLockChoice}
            options={AUTO_LOCK_OPTIONS}
            onChange={(value) => change("autoLockMinutes", Number(value))}
            align="end"
          />
        </div>
        <SettingToggle
          label="Lock when the window loses focus"
          detail="Closes locked notes the moment you switch to another app."
          checked={settings.lockOnBlur}
          onChange={(checked) => change("lockOnBlur", checked)}
        />
      </div>
      {lock.configured && (
        <div className={settingsGroup}>
          <div className={settingsGroupTitle}>Remove</div>
          <div className={settingsRow}>
            <span className={settingsRowLabel}>
              Remove the lock
              <span className={settingsRowDescription}>
                Unlocks every locked note for good and forgets the {noun} and recovery code.
              </span>
            </span>
            <InlineConfirm
              confirmLabel={busy ? "Removing…" : "Remove lock"}
              message="Every locked note becomes readable again on every device."
              messagePlacement="stacked"
              renderIdle={(arm) => (
                <button
                  type="button"
                  className={cn(settingsButton, settingsButtonDanger)}
                  disabled={busy}
                  onClick={() => withUnlockedSession(store, arm)}
                >
                  Remove lock…
                </button>
              )}
              onConfirm={() =>
                run("Removing the lock", async () => {
                  await removeLock(store);
                  showToast({ message: "Lock removed" });
                })
              }
            />
          </div>
        </div>
      )}
    </section>
  );
}
