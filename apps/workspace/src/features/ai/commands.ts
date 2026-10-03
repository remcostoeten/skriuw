import type { AppCommand } from "@/commands/registry";
import { aiEditorActionCommands, lastAiAction, requestAiRepeat } from "./editor-actions";
import { aiSettingsCommands, selectAiEnabled } from "./opt-in-gate";
import { voiceDictationCommands } from "./voice-dictation";

export function aiCommands(
  enabled: boolean,
  openSettings: () => void,
  openPlayground: () => void,
): AppCommand[] {
  return [
    {
      id: "ai-repeat-last",
      label: "AI: Repeat last action",
      group: "AI",
      keywords: ["ai", "repeat", "again", "redo", "last"],
      shortcut: "repeatAiAction",
      enabled: (state, ui) =>
        ui.route === "notes" &&
        selectAiEnabled(state) &&
        state.activeNoteId !== null &&
        lastAiAction() !== null,
      run: () => {
        requestAiRepeat();
      },
    },
    ...aiSettingsCommands(enabled, openSettings, openPlayground),
    ...aiEditorActionCommands(enabled),
    ...voiceDictationCommands(enabled),
  ];
}
