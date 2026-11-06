import { Suspense, lazy, useEffect } from "react";
import type { EditorAssistantHostProps, EditorExtension } from "@/features/editor/extensions";
import { clearPendingAiAction, requestAiAction } from "./editor-actions";
import { AiOptInGate, selectAiEnabled } from "./opt-in-gate";
import { clearPendingVoiceDictation } from "./voice-dictation";

const AiEditorActionHost = lazy(async () => {
  const module = await import("./editor-action-host");
  return { default: module.AiEditorActionHost };
});

const VoiceDictationHost = lazy(async () => {
  const module = await import("./voice-dictation-host");
  return { default: module.VoiceDictationHost };
});

function AiEditorHost({
  store,
  enabled,
  selectNoteId,
  getView,
  getNoteId,
  getNoteTarget,
}: EditorAssistantHostProps) {
  // A palette request queued before the gated host chunk arrives would
  // otherwise survive an opt-out and replay when AI is switched back on.
  useEffect(() => {
    if (!enabled) {
      clearPendingAiAction();
      clearPendingVoiceDictation();
    }
  }, [enabled]);
  return (
    <AiOptInGate store={store}>
      {(signal) => (
        <Suspense fallback={null}>
          <AiEditorActionHost
            store={store}
            signal={signal}
            selectNoteId={selectNoteId}
            getView={getView}
            getNoteId={getNoteId}
            getNoteTarget={getNoteTarget}
          />
          <VoiceDictationHost
            store={store}
            signal={signal}
            getView={getView}
            getNoteId={getNoteId}
          />
        </Suspense>
      )}
    </AiOptInGate>
  );
}

export const aiEditorExtension: EditorExtension = {
  assistant: {
    selectEnabled: selectAiEnabled,
    ask: () => requestAiAction(null),
    Host: AiEditorHost,
  },
};
