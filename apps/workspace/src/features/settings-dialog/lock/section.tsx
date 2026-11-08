import { settingsCopy } from "@/shared/ui/settings-copy";
import { useState } from "react";
import { Select } from "@/shared/ui/select";
import { InlineConfirm } from "@/shared/ui/inline-confirm";
import { cn } from "@/shared/styling/class-names";
import { showToast } from "@/shared/ui/toast";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import type { RendererState } from "@skriuw/renderer-core/store/types";
import {
  AUTO_LOCK_OPTIONS,
  relockNotes,
  removeLock,
  requestLockDialog,
  requestSessionUnlock,
  secretNoun,
  withUnlockedSession,
} from "@/features/lock/lock";
import type { AutoLockChoice } from "@/features/lock/lock";
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
import type { SectionProps } from "@/features/settings-dialog/sections";

function selectNoteLock(state: RendererState) {
  return state.noteLock;
}

function lockStatusText(configured: boolean, unlocked: boolean, count: number): string {
  if (!configured) {
    return settingsCopy.lock.noLockSetUpLockA;
  }
  const notes = count === 1 ? settingsCopy.lock.text1LockedNote : `${count} locked notes`;
  return unlocked
    ? `${notes}. Unlocked for this session.`
    : `${notes}. Locked until you enter your secret.`;
}

export function LockSection({ store }: SectionProps) {
  const { settings, change, changed } = useEditableSettings(store);
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
    <section aria-label={settingsCopy.lock.privacyAndLockPreferences} className={settingsSection}>
      <SettingsGroup
        id="note-lock"
        title="Note lock"
        keywords="pin passcode passphrase set up change unlock lock now"
      >
        <SettingsRow
          label={
            lock.configured
              ? `${noun.charAt(0).toUpperCase()}${noun.slice(1)} lock`
              : settingsCopy.lock.notSetUp
          }
          detail={lockStatusText(lock.configured, lock.unlocked, lock.lockedNoteCount)}
          notes={
            lock.configured && lock.hint ? (
              <span className={settingsRowDescription}>Hint: {lock.hint}</span>
            ) : null
          }
        >
          <span className="flex flex-wrap items-center justify-end gap-1.5">
            {!lock.configured && (
              <button
                type="button"
                className={settingsButton}
                onClick={() => requestLockDialog({ kind: "setup" })}
              >
                {settingsCopy.lock.setUpLock}
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
        </SettingsRow>
      </SettingsGroup>
      <SettingsGroup id="relocking" title="Relocking" keywords="auto-lock relock">
        <SettingsRow
          label={settingsCopy.lock.lockAgainAutomatically}
          detail={settingsCopy.lock.afterThisLongWithoutTypingClicking}
          changed={changed("autoLockMinutes")}
        >
          <Select
            label="Auto-lock delay"
            value={String(settings.autoLockMinutes) as AutoLockChoice}
            options={AUTO_LOCK_OPTIONS}
            onChange={(value) => change("autoLockMinutes", Number(value))}
            align="end"
          />
        </SettingsRow>
        <SettingToggle
          label={settingsCopy.lock.lockWhenTheWindowLosesFocus}
          detail={settingsCopy.lock.closesLockedNotesTheMomentYou}
          checked={settings.lockOnBlur}
          changed={changed("lockOnBlur")}
          onChange={(checked) => change("lockOnBlur", checked)}
        />
      </SettingsGroup>
      {lock.configured && (
        <SettingsGroup id="remove" title="Remove" tone="danger">
          <SettingsRow
            label={settingsCopy.lock.removeTheLock}
            detail={
              <>
                {settingsCopy.lock.unlocksEveryLockedNoteForGood}
                {noun}
                {settingsCopy.lock.andRecoveryCode}
              </>
            }
          >
            <InlineConfirm
              confirmLabel={busy ? "Removing…" : "Remove lock"}
              message={settingsCopy.lock.everyLockedNoteBecomesReadableAgain}
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
                run(settingsCopy.lock.removingTheLock, async () => {
                  await removeLock(store);
                  showToast({ message: "Lock removed" });
                })
              }
            />
          </SettingsRow>
        </SettingsGroup>
      )}
    </section>
  );
}
