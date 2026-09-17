import { useEffect, useMemo, useState } from "react";
import type { EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { useRendererSelector } from "@/store/use-renderer-selector";
import type { RendererState, RendererStore } from "@/store/types";
import { showToast } from "@/shared/ui/toast";
import { showsToasts } from "@/features/settings/settings-model";
import {
  aiActionInputError,
  aiActionInstructionError,
  aiActionOrigin,
  aiEditorAction,
  buildAiActionRequest,
  type AiEditorAction,
} from "./editor-actions";
import { actionInputRange, actionInputText } from "./editor-action-apply";
import { registerAiActionListener, rememberAiAction } from "./editor-action-controller";
import { aiModelLabel } from "@/features/ai/menu/ai-menu-model";
import { AiLauncher } from "@/features/ai/menu/ai-launcher";
import { AiMenu } from "@/features/ai/menu/ai-menu";
import { AiRunCard } from "@/features/ai/run/ai-run-card";
import { createRunSession } from "@/features/ai/run/run-session";
import { createDiagramRepair } from "./diagram-repair";
import { endAiRun, registerAiRun } from "@/features/ai/run/run-registry";
import { useRegisteredAiRun } from "@/features/ai/run/use-ai-run";
import { requestModelSwitcher } from "@/features/ai/models/model-switcher-controller";
import { requestAiSettings } from "@/features/ai/ai-settings-controller";
import { appRouteHash } from "@/app-route";
import { promptLibraryEntries, selectWorkspacePrompts } from "@/features/ai/prompts/prompt-library";
import {
  OLLAMA_PROVIDER_ID,
  parseAiModelSelection,
  selectRawAiModelSetting,
} from "@/features/ai/models/model-selection";

const LOCAL_PROVIDER_IDS: readonly string[] = [OLLAMA_PROVIDER_ID, "fake"];

type EditorCapture = {
  noteId: string;
  state: EditorState;
};

type Stage =
  | { kind: "closed" }
  | { kind: "menu"; capture: EditorCapture; action: AiEditorAction | null };

type EditorActionHostProps = {
  store: RendererStore;
  signal: AbortSignal;
  selectNoteId: (state: RendererState) => string | null;
  getView: () => EditorView | null;
  getNoteId: () => string | null;
};

function selectToastsOn(state: RendererState): boolean {
  return showsToasts(state.settings);
}

/**
 * Owns every transient AI editor surface. It mounts only inside the opt-in
 * gate, so with AI off no launcher, menu, preview buffer, provider module, or
 * model lookup exists at all — and nothing here runs on startup, typing, save,
 * or navigation.
 *
 * A run is not component state: it lives in the run registry under the note it
 * was fired against, so switching notes hides its card and switching back
 * shows it again, with whatever streamed meanwhile already in it.
 */
export function AiEditorActionHost({
  store,
  signal,
  selectNoteId,
  getView,
  getNoteId,
}: EditorActionHostProps) {
  const [stage, setStage] = useState<Stage>({ kind: "closed" });
  const [blocked, setBlocked] = useState<string | null>(null);
  const [runLive, setRunLive] = useState(false);

  const noteId = useRendererSelector(store, selectNoteId);
  const registered = useRegisteredAiRun(noteId);
  const storedPrompts = useRendererSelector(store, selectWorkspacePrompts);
  const rawModel = useRendererSelector(store, selectRawAiModelSetting);
  const model = useMemo(() => parseAiModelSelection(rawModel), [rawModel]);
  const modelLabel = aiModelLabel(model?.providerId ?? null, model?.modelId ?? null);
  const remote = model !== null && !LOCAL_PROVIDER_IDS.includes(model.providerId);

  // Serialising the note is the expensive half of opening the menu, so it is
  // read once per capture rather than once per render of a surface that stays
  // on screen while the writer types a translation target.
  const menuInputs = useMemo(() => {
    if (stage.kind !== "menu") {
      return null;
    }
    const selection = actionInputText(stage.capture.state, "selection");
    return {
      selection,
      note: actionInputText(stage.capture.state, "note"),
      hasSelection: selection.trim().length > 0,
    };
  }, [stage]);

  function captureEditor(): EditorCapture | null {
    const view = getView();
    const noteId = getNoteId();
    return view === null || noteId === null ? null : { noteId, state: view.state };
  }

  function openMenu(actionId: string | null): void {
    const capture = captureEditor();
    if (capture === null) {
      return;
    }
    setBlocked(null);
    setStage({
      kind: "menu",
      capture,
      action: actionId === null ? null : aiEditorAction(actionId),
    });
  }

  /**
   * A repeat skips the menu, so its refusal has nowhere to land unless the menu
   * is opened for it: on the action's own pane when it takes an instruction,
   * on the list otherwise, where "Select some text first" is already a row.
   */
  function repeatAction(action: AiEditorAction, instruction: string): void {
    const capture = captureEditor();
    if (capture === null) {
      return;
    }
    if (!startRun(capture, action, instruction)) {
      setStage({ kind: "menu", capture, action: action.instruction === null ? null : action });
    }
  }

  useEffect(
    () =>
      registerAiActionListener({
        isFocused: () => getView()?.hasFocus() === true,
        open: openMenu,
        repeat: repeatAction,
      }),
  );

  /**
   * Turns a chosen action into a live run, or into the reason it cannot be one.
   * Every refusal is answered in the menu the writer is still looking at, so a
   * blocked action never opens a run card that has nothing to show.
   */
  function startRun(
    capture: EditorCapture,
    action: AiEditorAction,
    instruction: string,
  ): boolean {
    const input = actionInputText(capture.state, action.scope);
    const failure =
      aiActionInputError(action, input) ??
      aiActionInstructionError(action, instruction) ??
      (model === null ? "Choose an AI model first." : null);
    if (failure !== null || model === null) {
      setBlocked(failure);
      return false;
    }
    const prompt = promptLibraryEntries(storedPrompts).find(
      (entry) => entry.builtInId === action.promptId,
    );
    if (prompt === undefined) {
      setBlocked("That prompt is missing from the library.");
      return false;
    }
    const range = actionInputRange(capture.state, action.scope);
    const request = buildAiActionRequest({
      action,
      selection: model,
      systemPrompt: prompt.systemPrompt,
      parameters: prompt.parameters,
      input,
      instruction,
      requestId: crypto.randomUUID(),
    });
    const session = createRunSession({
      origin: aiActionOrigin(action),
      signal,
      repair: action.outcome === "diagram" ? createDiagramRepair() : undefined,
    });
    registerAiRun(
      {
        action,
        target: { noteId: capture.noteId, from: range.from, to: range.to, input },
        request,
        modelLabel,
        session,
      },
      {
        signal,
        onStopped: (entry) => {
          if (selectToastsOn(store.getState())) {
            showToast({ message: `${entry.action.label} stopped because you left the note.` });
          }
        },
      },
    );
    setBlocked(null);
    setStage({ kind: "closed" });
    rememberAiAction(action.id, instruction);
    session.fire(request);
    return true;
  }

  return (
    <>
      <AiLauncher
        state={
          registered !== null
            ? runLive
              ? "working"
              : "settled"
            : stage.kind === "menu"
              ? "menu"
              : "idle"
        }
        getView={getView}
        onOpen={() => openMenu(null)}
      />
      {stage.kind === "menu" && menuInputs !== null && (
        <AiMenu
          key={stage.action?.id ?? "picker"}
          getView={getView}
          from={stage.capture.state.selection.from}
          to={stage.capture.state.selection.to}
          hasSelection={menuInputs.hasSelection}
          selectionInput={menuInputs.selection}
          noteInput={menuInputs.note}
          modelLabel={modelLabel}
          remote={remote}
          blocked={blocked}
          initialAction={stage.action}
          onRun={(action, instruction) => startRun(stage.capture, action, instruction)}
          onChangeModel={requestModelSwitcher}
          onOpenSettings={() => {
            setStage({ kind: "closed" });
            requestAiSettings();
          }}
          onOpenPrompts={() => {
            setStage({ kind: "closed" });
            window.location.hash = appRouteHash("prompt-playground");
          }}
          onClose={() => setStage({ kind: "closed" })}
        />
      )}
      {registered !== null && (
        <AiRunCard
          key={registered.request.requestId}
          store={store}
          action={registered.action}
          target={registered.target}
          session={registered.session}
          modelLabel={registered.modelLabel}
          getView={getView}
          getNoteId={getNoteId}
          onLiveChange={setRunLive}
          onClose={() => endAiRun(registered.target.noteId, registered)}
        />
      )}
    </>
  );
}
