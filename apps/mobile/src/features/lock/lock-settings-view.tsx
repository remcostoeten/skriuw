import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import type { RendererState } from "@skriuw/renderer-core/store/types";
import { commitOperations } from "../../bridge/commit";
import { MINIMUM_TOUCH_TARGET } from "../../shell/metrics";
import { useTheme } from "../../shell/theme";
import { useWorkspace, useWorkspaceSelector } from "../../shell/workspace-provider";
import {
  describeBiometry,
  type BiometricEnrollment,
  type BiometricUnlock,
} from "./biometrics";
import {
  AUTO_LOCK_OPTIONS,
  autoLockMinutes,
  lockErrorMessage,
  secretNoun,
} from "./lock-model";
import { relockNotes, removeLock, unlockNotes } from "./lock-session";
import { ChangeSecretView, SetupLockView } from "./lock-setup-view";
import { LockButton, LockError, LockField } from "./secret-fields";
import { UnlockView } from "./unlock-view";
import { usePlatformBiometrics } from "./use-platform-biometrics";

/**
 * Everything the owner of a workspace can do to its lock, on one screen: set
 * it up, open it, hold the secret behind biometrics, choose how long an idle
 * screen stays open, change the secret, and remove the lock entirely.
 *
 * Removing is the only destructive one and it is confirmed, because it
 * permanently decrypts every locked note rather than hiding them again.
 */

type Props = {
  /** Injected in tests; this device's keystore and sensor otherwise. */
  biometrics?: BiometricUnlock;
};

type Panel = "settings" | "setup" | "change" | "unlock" | "remove";

function selectLock(state: RendererState) {
  return state.noteLock;
}

function selectAutoLockMinutes(state: RendererState): number {
  return autoLockMinutes(state.settings);
}

export function LockSettingsView({ biometrics: injected }: Props) {
  const platformBiometrics = usePlatformBiometrics();
  const biometrics = injected ?? platformBiometrics;
  const theme = useTheme();
  const session = useWorkspace();
  const lock = useWorkspaceSelector(selectLock);
  const minutes = useWorkspaceSelector(selectAutoLockMinutes);
  const [panel, setPanel] = useState<Panel>("settings");
  const [enrollment, setEnrollment] = useState<BiometricEnrollment | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [secret, setSecret] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const describe = useCallback(() => {
    biometrics.describe().then(setEnrollment).catch(session.reportFailure);
  }, [biometrics, session]);

  useEffect(describe, [describe]);

  function back(): void {
    setPanel("settings");
    setNotice(null);
    describe();
  }

  if (panel === "setup") {
    return <SetupLockView onCancel={back} onDone={back} />;
  }
  if (panel === "change") {
    return <ChangeSecretView biometrics={biometrics} onCancel={back} onDone={back} />;
  }
  if (panel === "unlock") {
    return <UnlockView biometrics={biometrics} onCancel={back} onUnlocked={back} />;
  }

  function chooseMinutes(value: number): void {
    const settings = session.store.getState().settings;
    commitOperations(session, [
      { type: "update_settings", settings: { ...settings, autoLockMinutes: value } },
    ]).catch(session.reportFailure);
  }

  /**
   * Turning biometrics on needs the secret itself, not just an open session:
   * the key the session holds is inside Rust and cannot be handed to the
   * keystore. It is checked against the backend before it is stored, so a
   * mistyped secret never becomes an entry that can only fail.
   */
  async function armBiometrics(): Promise<void> {
    setBusy(true);
    setNotice(null);
    try {
      await unlockNotes(session, secret);
      setEnrollment(await biometrics.enable(secret));
      setSecret("");
      setEnrolling(false);
    } catch (failure) {
      setNotice(lockErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  async function disarmBiometrics(): Promise<void> {
    setBusy(true);
    try {
      setEnrollment(await biometrics.disable());
    } catch (failure) {
      setNotice(lockErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  async function confirmRemove(): Promise<void> {
    setBusy(true);
    setNotice(null);
    try {
      await removeLock(session, biometrics);
      setPanel("settings");
      describe();
    } catch (failure) {
      setNotice(lockErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  const noun = secretNoun(lock.kind);

  return (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <Text accessibilityRole="header" style={[styles.heading, { color: theme.color("foreground") }]}>
        Locked notes
      </Text>

      {!lock.configured ? (
        <>
          <Text style={[styles.detail, { color: theme.color("muted-foreground") }]}>
            Set one {noun} to encrypt any note or folder you lock. Locked notes leave search,
            links, tasks and history until they are unlocked again.
          </Text>
          <LockButton label="Set up lock" onPress={() => setPanel("setup")} primary />
        </>
      ) : (
        <>
          <Text style={[styles.detail, { color: theme.color("muted-foreground") }]}>
            {lock.lockedNoteCount === 1
              ? "1 note is locked on this device."
              : `${lock.lockedNoteCount} notes are locked on this device.`}{" "}
            {lock.unlocked ? "This session is open." : `Enter your ${noun} to open them.`}
          </Text>

          {lock.unlocked ? (
            <LockButton
              label="Lock now"
              onPress={() => {
                relockNotes(session).catch(session.reportFailure);
              }}
            />
          ) : (
            <LockButton label="Unlock notes…" onPress={() => setPanel("unlock")} primary />
          )}

          <View style={[styles.divider, { backgroundColor: theme.color("border") }]} />

          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={[styles.label, { color: theme.color("foreground") }]}>
                Unlock with biometrics
              </Text>
              <Text style={[styles.detail, { color: theme.color("muted-foreground") }]}>
                {enrollment === null ? "Checking this device…" : describeBiometry(enrollment)}
              </Text>
            </View>
            <Switch
              accessibilityLabel="Unlock with biometrics"
              disabled={
                busy ||
                enrollment === null ||
                (enrollment.state !== "on" && enrollment.state !== "off")
              }
              onValueChange={(next) => {
                setNotice(null);
                if (!next) {
                  void disarmBiometrics();
                  return;
                }
                setEnrolling(true);
              }}
              value={enrollment?.state === "on" || enrolling}
            />
          </View>

          {enrolling && enrollment?.state === "off" && (
            <>
              <LockField
                autoFocus
                label={`Confirm your ${noun}`}
                numeric={lock.kind === "pin"}
                onChangeText={setSecret}
                secure
                value={secret}
              />
              <View style={styles.actions}>
                <LockButton
                  label="Cancel"
                  onPress={() => {
                    setEnrolling(false);
                    setSecret("");
                  }}
                />
                <LockButton
                  disabled={busy || secret.length === 0}
                  label={busy ? "Storing…" : "Turn on"}
                  onPress={() => void armBiometrics()}
                  primary
                />
              </View>
            </>
          )}

          <View style={[styles.divider, { backgroundColor: theme.color("border") }]} />

          <Text style={[styles.label, { color: theme.color("foreground") }]}>Lock when idle</Text>
          <View accessibilityRole="radiogroup" accessibilityLabel="Lock when idle">
            {AUTO_LOCK_OPTIONS.map((option) => {
              const selected = option.minutes === minutes;
              return (
                <Pressable
                  accessibilityLabel={option.label}
                  accessibilityRole="radio"
                  accessibilityState={{ selected, checked: selected }}
                  key={option.minutes}
                  onPress={() => chooseMinutes(option.minutes)}
                  style={styles.row}
                >
                  <Text style={[styles.label, { color: theme.color("foreground") }]}>
                    {option.label}
                  </Text>
                  <View
                    style={[
                      styles.marker,
                      {
                        backgroundColor: selected
                          ? theme.color("theme-accent-blue")
                          : "transparent",
                        borderColor: selected
                          ? theme.color("theme-accent-blue")
                          : theme.color("border"),
                      },
                    ]}
                  />
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.detail, { color: theme.color("muted-foreground") }]}>
            Locked notes always close when Skriuw goes to the background.
          </Text>

          <View style={[styles.divider, { backgroundColor: theme.color("border") }]} />

          <LockButton
            disabled={!lock.unlocked}
            label="Change lock"
            onPress={() => setPanel("change")}
          />

          {panel === "remove" ? (
            <>
              <Text style={[styles.detail, { color: theme.color("destructive") }]}>
                Removing the lock decrypts every locked note permanently and puts them back into
                search, links, tasks and history. The recovery code stops working.
              </Text>
              <View style={styles.actions}>
                <LockButton label="Keep lock" onPress={() => setPanel("settings")} />
                <LockButton
                  disabled={busy}
                  label={busy ? "Removing…" : "Remove lock"}
                  onPress={() => void confirmRemove()}
                />
              </View>
            </>
          ) : (
            <LockButton
              disabled={!lock.unlocked}
              label="Remove lock…"
              onPress={() => setPanel("remove")}
            />
          )}
        </>
      )}

      {notice !== null && <LockError>{notice}</LockError>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: 12,
    padding: 20,
  },
  heading: {
    fontSize: 20,
    fontWeight: "600",
  },
  label: {
    fontSize: 15,
  },
  detail: {
    fontSize: 13,
    lineHeight: 18,
  },
  row: {
    minHeight: MINIMUM_TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  marker: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
  },
});
