import { useEffect, useMemo, useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { RendererState } from "../../../../shared/renderer-core/src/store/types";
import { useTheme } from "../../shell/theme";
import { useWorkspace, useWorkspaceSelector } from "../../shell/workspace-provider";
import { createAppPhaseSource } from "./app-state";
import type { BiometricUnlock } from "./biometrics";
import { createLockLifecycle } from "./lock-lifecycle";
import { isNoteSealed } from "./lock-model";
import type { AppPhase, Observable, ScreenGuard } from "./port";
import { UnlockView } from "./unlock-view";

/**
 * The one mount point the shell needs for locked notes.
 *
 * It owns three things that have to agree with each other: the lock session's
 * lifecycle, the cover that hides the shell from the app-switcher snapshot,
 * and the unlock screen that stands where the editor would be for a sealed
 * note. Keeping them together is what makes "went to the background, came back
 * locked" one behaviour rather than three that can drift.
 */

type Props = {
  biometrics: BiometricUnlock;
  children: ReactNode;
  /** Injected in tests; the platform's `AppState` otherwise. */
  phase?: Observable<AppPhase>;
  screenGuard?: ScreenGuard;
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

export function LockGate({ biometrics, children, phase, screenGuard }: Props) {
  const theme = useTheme();
  const session = useWorkspace();
  const [concealed, setConcealed] = useState(false);
  const sealed = useWorkspaceSelector(selectSealedActiveNote, sameSealedNote);
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
      {sealed.noteId !== null && (
        <View style={[styles.overlay, { backgroundColor: theme.color("background") }]}>
          <UnlockView
            biometrics={biometrics}
            /* Nothing to do: hydrating the opened body clears `sealed` itself. */
            onUnlocked={() => undefined}
            title={sealed.title.length === 0 ? "This note is locked" : `${sealed.title} is locked`}
          />
        </View>
      )}
      {concealed && (
        <View
          accessibilityElementsHidden
          accessibilityViewIsModal
          importantForAccessibility="no-hide-descendants"
          style={[styles.overlay, styles.centred, { backgroundColor: theme.color("theme-bg-deep") }]}
        >
          <Text style={[styles.mark, { color: theme.color("muted-foreground") }]}>Skriuw</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
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
