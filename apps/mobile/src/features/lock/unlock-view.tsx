import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { RendererState } from "@skriuw/renderer-core/store/types";
import { useTheme } from "../../shell/theme";
import { useWorkspace, useWorkspaceSelector } from "../../shell/workspace-provider";
import { biometryNoun, type BiometricEnrollment, type BiometricUnlock } from "./biometrics";
import {
  emptySecretDraft,
  formatWait,
  lockErrorMessage,
  normalizeHint,
  normalizeRecoveryCodeInput,
  recoveryCodeLooksComplete,
  secretDraftError,
  secretNoun,
  unlockPresentation,
  type SecretDraft,
} from "./lock-model";
import { recoverNotes, unlockNotes } from "./lock-session";
import { LockButton, LockError, LockField, SecretFields } from "./secret-fields";

/**
 * The screen a sealed note is behind, and the only way back into the session.
 *
 * Biometry and the typed secret are the same unlock: both end at
 * `unlockNoteLock`, so both are counted, both are refused while the backend's
 * delay is running, and neither can be used to walk past the other. What
 * biometry replaces is the typing, not the check.
 */

/** What the platform shows in its own biometric prompt. */
export const UNLOCK_PROMPT = "Unlock your locked notes";

type Props = {
  biometrics: BiometricUnlock;
  /** The lock was opened. The caller dismisses this screen. */
  onUnlocked: () => void;
  /** Absent when the screen cannot be dismissed, which is the editor's case. */
  onCancel?: () => void;
  title?: string;
};

function selectNoteLock(state: RendererState) {
  return state.noteLock;
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

export function UnlockView({ biometrics, onUnlocked, onCancel, title }: Props) {
  const theme = useTheme();
  const session = useWorkspace();
  const lock = useWorkspaceSelector(selectNoteLock);
  const [phase, setPhase] = useState<"secret" | "recovery">("secret");
  const [secret, setSecret] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [replacement, setReplacement] = useState<SecretDraft>(() =>
    emptySecretDraft(lock.kind ?? "pin"),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [enrollment, setEnrollment] = useState<BiometricEnrollment | null>(null);
  const promptedOnce = useRef(false);
  const now = useNow(lock.nextAttemptAt !== null);
  const presentation = unlockPresentation(lock, now);
  const noun = secretNoun(lock.kind);

  const open = useCallback(
    async (value: string): Promise<boolean> => {
      setBusy(true);
      setError(null);
      try {
        await unlockNotes(session, value);
        return true;
      } catch (failure) {
        setSecret("");
        setError(lockErrorMessage(failure));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [session],
  );

  const promptBiometrics = useCallback(async (): Promise<void> => {
    const reveal = await biometrics.reveal(UNLOCK_PROMPT);
    if (reveal.outcome === "cancelled") {
      return;
    }
    if (reveal.outcome === "unavailable") {
      setEnrollment(await biometrics.describe());
      setError(`Biometrics are no longer available on this device. Enter your ${noun}.`);
      return;
    }
    if (reveal.outcome === "failed") {
      setEnrollment(await biometrics.describe());
      setError(reveal.message);
      return;
    }
    if (await open(reveal.secret)) {
      onUnlocked();
    }
  }, [biometrics, noun, onUnlocked, open]);

  useEffect(() => {
    let cancelled = false;
    biometrics
      .describe()
      .then((described) => {
        if (!cancelled) {
          setEnrollment(described);
        }
      })
      .catch(session.reportFailure);
    return () => {
      cancelled = true;
    };
  }, [biometrics, session]);

  /**
   * Raised once per visit, the way the platform's own locked surfaces do.
   * Not retried after a dismissal: a prompt that keeps coming back is a prompt
   * nobody can get past to type the secret instead.
   */
  useEffect(() => {
    if (promptedOnce.current || enrollment?.state !== "on" || presentation.throttled) {
      return;
    }
    promptedOnce.current = true;
    promptBiometrics().catch(session.reportFailure);
  }, [enrollment, presentation.throttled, promptBiometrics, session]);

  async function submitSecret(): Promise<void> {
    if (secret.length === 0 || presentation.throttled) {
      return;
    }
    if (await open(secret)) {
      onUnlocked();
    }
  }

  async function submitRecovery(): Promise<void> {
    const problem = secretDraftError(replacement);
    if (problem !== null) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await recoverNotes(
        session,
        recoveryCode,
        {
          kind: replacement.kind,
          secret: replacement.secret,
          hint: normalizeHint(replacement.hint),
        },
        biometrics,
      );
      onUnlocked();
    } catch (failure) {
      setError(lockErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  if (phase === "recovery") {
    return (
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={[styles.intro, { color: theme.color("muted-foreground") }]}>
          Enter the recovery code shown when the lock was set up, then choose a new {noun}.
        </Text>
        <LockField
          autoFocus
          label="Recovery code"
          monospace
          onChangeText={(value) => setRecoveryCode(normalizeRecoveryCodeInput(value))}
          placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
          value={recoveryCode}
        />
        <SecretFields autoFocus={false} onChange={setReplacement} value={replacement} />
        {error !== null && <LockError>{error}</LockError>}
        <View style={styles.actions}>
          <LockButton label="Back" onPress={() => setPhase("secret")} />
          <LockButton
            disabled={busy || !recoveryCodeLooksComplete(recoveryCode)}
            label={busy ? "Unlocking…" : "Unlock and set new lock"}
            onPress={() => void submitRecovery()}
            primary
          />
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <Text
        accessibilityRole="header"
        style={[styles.heading, { color: theme.color("foreground") }]}
      >
        {title ?? "Locked notes"}
      </Text>
      <Text style={[styles.intro, { color: theme.color("muted-foreground") }]}>
        {lock.configured
          ? `Enter your ${noun} to read and edit them.`
          : "These notes were locked on another device. Their lock has not arrived here yet."}
      </Text>
      {lock.configured && (
        <>
          <LockField
            autoFocus
            describedBy={presentation.showHint ? `Hint: ${lock.hint ?? ""}` : null}
            label={noun}
            numeric={lock.kind === "pin"}
            onChangeText={setSecret}
            secure
            value={secret}
          />
          {presentation.showHint && (
            <Text style={[styles.intro, { color: theme.color("muted-foreground") }]}>
              Hint: {lock.hint}
            </Text>
          )}
          {presentation.throttled ? (
            <LockError>{`Too many attempts. Try again in ${formatWait(presentation.waitMs)}.`}</LockError>
          ) : (
            error !== null && <LockError>{error}</LockError>
          )}
          <View style={styles.actions}>
            {onCancel !== undefined && <LockButton label="Cancel" onPress={onCancel} />}
            <LockButton
              disabled={busy || presentation.throttled || secret.length === 0}
              label={busy ? "Unlocking…" : "Unlock"}
              onPress={() => void submitSecret()}
              primary
            />
          </View>
          {enrollment?.state === "on" && (
            <LockButton
              disabled={busy || presentation.throttled}
              label={`Use ${biometryNoun(enrollment.kind)}`}
              onPress={() => void promptBiometrics().catch(session.reportFailure)}
            />
          )}
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setError(null);
              setPhase("recovery");
            }}
            style={styles.link}
          >
            <Text style={{ color: theme.color("muted-foreground"), fontSize: 13 }}>
              Forgot your {noun}?
            </Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: 14,
    padding: 20,
  },
  heading: {
    fontSize: 20,
    fontWeight: "600",
  },
  intro: {
    fontSize: 13,
    lineHeight: 18,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
  },
  link: {
    alignSelf: "flex-start",
    minHeight: 44,
    justifyContent: "center",
  },
});
