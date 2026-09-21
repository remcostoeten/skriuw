import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { RendererState } from "@skriuw/renderer-core/store/types";
import { useTheme } from "../../shell/theme";
import { useWorkspace, useWorkspaceSelector } from "../../shell/workspace-provider";
import type { BiometricRearm } from "./biometrics";
import {
  emptySecretDraft,
  lockErrorMessage,
  normalizeHint,
  secretDraftError,
  secretNoun,
  type SecretDraft,
} from "./lock-model";
import { changeNoteSecret, setUpNoteLock } from "./lock-session";
import { LockButton, LockError, SecretFields } from "./secret-fields";

/**
 * Setting the workspace's one secret, and changing it later.
 *
 * The recovery code is the whole reason setup is a screen rather than a field:
 * it is shown once, never stored, and it is the only way back in if the secret
 * is forgotten. The screen says what losing both costs before the code can be
 * dismissed.
 */

type SetupProps = {
  /** Runs once the code has been acknowledged, so the lock is usable. */
  onDone: () => void;
  onCancel: () => void;
};

export function SetupLockView({ onDone, onCancel }: SetupProps) {
  const theme = useTheme();
  const session = useWorkspace();
  const [draft, setDraft] = useState<SecretDraft>(() => emptySecretDraft());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const noun = secretNoun(draft.kind);

  async function submit(): Promise<void> {
    const problem = secretDraftError(draft);
    if (problem !== null) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setRecoveryCode(
        await setUpNoteLock(session, {
          kind: draft.kind,
          secret: draft.secret,
          hint: normalizeHint(draft.hint),
        }),
      );
    } catch (failure) {
      setError(lockErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  if (recoveryCode !== null) {
    return (
      <ScrollView contentContainerStyle={styles.body}>
        <Text
          accessibilityRole="header"
          style={[styles.heading, { color: theme.color("foreground") }]}
        >
          Save your recovery code
        </Text>
        <Text style={[styles.intro, { color: theme.color("foreground") }]}>
          Your notes can be unlocked with this code if you forget your {noun}. It is shown once and
          never stored.
        </Text>
        <Text
          accessibilityLabel={`Recovery code ${recoveryCode.split("").join(" ")}`}
          selectable
          style={[
            styles.code,
            {
              backgroundColor: theme.color("muted"),
              borderColor: theme.color("border"),
              color: theme.color("foreground"),
            },
          ]}
        >
          {recoveryCode}
        </Text>
        <Text style={[styles.intro, { color: theme.color("muted-foreground") }]}>
          Without the {noun} or this code, locked notes cannot be read again, not by you and not by
          anyone else.
        </Text>
        <View style={styles.actions}>
          <LockButton label="I saved it" onPress={onDone} primary />
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
        Lock notes
      </Text>
      <Text style={[styles.intro, { color: theme.color("muted-foreground") }]}>
        One {noun} protects every note you lock. Locked notes are encrypted on this device and left
        out of search, links, and history until unlocked.
      </Text>
      <SecretFields onChange={setDraft} value={draft} />
      {error !== null && <LockError>{error}</LockError>}
      <View style={styles.actions}>
        <LockButton label="Cancel" onPress={onCancel} />
        <LockButton
          disabled={busy}
          label={busy ? "Setting up…" : "Set up lock"}
          onPress={() => void submit()}
          primary
        />
      </View>
    </ScrollView>
  );
}

function selectLockKind(state: RendererState) {
  return state.noteLock.kind;
}

function selectLockHint(state: RendererState) {
  return state.noteLock.hint;
}

type ChangeProps = {
  biometrics: BiometricRearm;
  onDone: () => void;
  onCancel: () => void;
};

export function ChangeSecretView({ biometrics, onDone, onCancel }: ChangeProps) {
  const theme = useTheme();
  const session = useWorkspace();
  const kind = useWorkspaceSelector(selectLockKind);
  const hint = useWorkspaceSelector(selectLockHint);
  const [draft, setDraft] = useState<SecretDraft>(() => ({
    ...emptySecretDraft(kind ?? "pin"),
    hint: hint ?? "",
  }));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(): Promise<void> {
    const problem = secretDraftError(draft);
    if (problem !== null) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await changeNoteSecret(
        session,
        { kind: draft.kind, secret: draft.secret, hint: normalizeHint(draft.hint) },
        biometrics,
      );
      onDone();
    } catch (failure) {
      setError(lockErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <Text
        accessibilityRole="header"
        style={[styles.heading, { color: theme.color("foreground") }]}
      >
        Change lock
      </Text>
      <Text style={[styles.intro, { color: theme.color("muted-foreground") }]}>
        The recovery code from setup keeps working after the change.
      </Text>
      <SecretFields onChange={setDraft} value={draft} />
      {error !== null && <LockError>{error}</LockError>}
      <View style={styles.actions}>
        <LockButton label="Cancel" onPress={onCancel} />
        <LockButton
          disabled={busy}
          label={busy ? "Saving…" : "Change lock"}
          onPress={() => void submit()}
          primary
        />
      </View>
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
  code: {
    borderRadius: 10,
    borderWidth: 1,
    fontFamily: "Courier",
    fontSize: 15,
    letterSpacing: 1.5,
    paddingHorizontal: 12,
    paddingVertical: 12,
    textAlign: "center",
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
  },
});
