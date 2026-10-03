import { useEffect, useMemo, useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { RendererState } from "@skriuw/renderer-core/store/types";
import { useTheme } from "../../shell/theme";
import { useWorkspace, useWorkspaceSelector } from "../../shell/workspace-provider";
import { createAppPhaseSource } from "./app-state";
import type { BiometricUnlock } from "./biometrics";
import { createLockLifecycle } from "./lock-lifecycle";
import { isNoteSealed } from "./lock-model";
import type { AppPhase, Observable, ScreenGuard } from "./port";
import { UnlockView } from "./unlock-view";
import { usePlatformBiometrics } from "./use-platform-biometrics";

/**
 * Locked notes need two mounts, because they guard two different extents.
 *
 * `LockGate` sits around the whole shell in the root layout. It owns the lock
 * session's lifecycle and the cover that hides the shell from the app-switcher
 * snapshot, so "went to the background, came back locked" is one behaviour
 * rather than several that can drift. An open sheet is its own native `Modal`
 * window and stays above the cover; only a bound `ScreenGuard` hides that.
 *
 * `SealedNoteGate` sits around the editor. The unlock screen stands where the
 * note would be and nowhere else, so the toolbar, tab bar and tree stay
 * usable and a locked note never traps the reader on itself.
 */

type LockGateProps = {
  children: ReactNode;
  /** Injected in tests; the platform's `AppState` otherwise. */
  phase?: Observable<AppPhase>;
  screenGuard?: ScreenGuard;
};

type SealedNoteGateProps = {
  /** False while the editor is hidden, so the gate takes no space and shows no unlock screen. */
  active?: boolean;
  /** Injected in tests; this device's keystore and sensor otherwise. */
  biometrics?: BiometricUnlock;
  children: ReactNode;
};

type SealedNote = { noteId: string | null; title: string };

const NO_SEALED_NOTE: SealedNote = { noteId: null, title: "" };

function selectSealedActiveNote(state: RendererState): SealedNote {
  const noteId = state.activeNoteId;
  if (noteId === null || !isNoteSealed(state, noteId)) {
    return NO_SEALED_NOTE;
  }
  return { noteId, title: state.nodes.get(noteId)?.title ?? "" };
}

function sameSealedNote(left: SealedNote, right: SealedNote): boolean {
  return left.noteId === right.noteId && left.title === right.title;
}

export function LockGate({ children, phase, screenGuard }: LockGateProps) {
  const theme = useTheme();
  const session = useWorkspace();
  const [concealed, setConcealed] = useState(false);
  const source = useMemo(() => phase ?? createAppPhaseSource(), [phase]);

  useEffect(
    () =>
      createLockLifecycle({
        session,
        phase: source,
        screenGuard,
        setConcealed,
      }).start(),
    [screenGuard, session, source],
  );

  return (
    <View style={styles.fill}>
      {children}
      {concealed && (
        <View
          accessibilityElementsHidden
          accessibilityViewIsModal
          importantForAccessibility="no-hide-descendants"
          style={[
            styles.overlay,
            styles.centred,
            { backgroundColor: theme.color("theme-bg-deep") },
          ]}
        >
          <Text style={[styles.mark, { color: theme.color("muted-foreground") }]}>Skriuw</Text>
        </View>
      )}
    </View>
  );
}

export function SealedNoteGate({ active = true, biometrics, children }: SealedNoteGateProps) {
  const theme = useTheme();
  const platformBiometrics = usePlatformBiometrics();
  const sealed = useWorkspaceSelector(selectSealedActiveNote, sameSealedNote);

  const covered = active && sealed.noteId !== null;

  return (
    <View style={active ? styles.fill : styles.hidden}>
      <View
        style={styles.fill}
        accessibilityElementsHidden={covered}
        importantForAccessibility={covered ? "no-hide-descendants" : "auto"}
      >
        {children}
      </View>
      {covered && (
        <View style={[styles.overlay, { backgroundColor: theme.color("background") }]}>
          <UnlockView
            biometrics={biometrics ?? platformBiometrics}
            /* Nothing to do: hydrating the opened body clears `sealed` itself. */
            onUnlocked={() => undefined}
            title={sealed.title.length === 0 ? "This note is locked" : `${sealed.title} is locked`}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  hidden: {
    display: "none",
  },
  overlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  centred: {
    alignItems: "center",
    justifyContent: "center",
  },
  mark: {
    fontSize: 15,
    letterSpacing: 2,
  },
});
