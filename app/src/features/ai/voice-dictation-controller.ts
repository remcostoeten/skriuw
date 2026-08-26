import type { AppCommand } from "@/commands/registry";
import { guardAiRegistrations } from "./opt-in-gate";

export type VoiceDictationListener = {
  /** Whether this listener's editor currently holds the caret. */
  isFocused: () => boolean;
  open: () => void;
};

const listeners: VoiceDictationListener[] = [];
let pending = false;

export function registerVoiceDictationListener(next: VoiceDictationListener): () => void {
  listeners.push(next);
  if (pending) {
    pending = false;
    requestVoiceDictation();
  }
  return () => {
    const index = listeners.indexOf(next);
    if (index >= 0) {
      listeners.splice(index, 1);
    }
  };
}

function activeListener(): VoiceDictationListener | null {
  return (
    listeners.find((listener) => listener.isFocused()) ??
    listeners[listeners.length - 1] ??
    null
  );
}

/**
 * Opens the dictation surface over the active editor. A request made before a
 * host mounts is queued and replayed once one registers, so the first
 * invocation after the AI gate turns on is not lost to a lazy chunk loading.
 */
export function requestVoiceDictation(): void {
  const listener = activeListener();
  if (listener === null) {
    pending = true;
    return;
  }
  listener.open();
}

/** Drops a queued request when the gate closes before the host ever mounted. */
export function clearPendingVoiceDictation(): void {
  pending = false;
}

export function voiceDictationCommands(enabled: boolean): readonly AppCommand[] {
  return guardAiRegistrations(enabled, () => [
    {
      id: "voice-dictate",
      label: "AI: Dictate into note",
      group: "AI",
      keywords: ["voice", "dictation", "speech", "microphone", "record", "transcribe"],
      enabled: (state, ui) => ui.route === "notes" && state.activeNoteId !== null,
      run: () => requestVoiceDictation(),
    },
  ]);
}
