import { useEffect, useMemo, useState } from "react";
import type { EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import type { AiCompletionRequest } from "@/contracts/ai";
import { useRendererSelector } from "@/store/use-renderer-selector";
import type { RendererStore } from "@/store/types";
import {
  aiActionInputError,
  aiActionInstructionError,
  aiEditorAction,
  buildAiActionRequest,
  type AiEditorAction,
} from "./editor-actions";
import { actionInputRange, actionInputText } from "./editor-action-apply";
import type { AiActionTarget } from "./editor-action-model";
import { registerAiActionListener } from "./editor-action-controller";
import { aiModelLabel } from "./ai-menu-model";
import { AiLauncher } from "./ai-launcher";
import { AiMenu } from "./ai-menu";
import { AiRunCard } from "./ai-run-card";
import { requestModelSwitcher } from "./model-switcher-controller";
import { promptLibraryEntries, selectWorkspacePrompts } from "./prompt-library";
import {
  OLLAMA_PROVIDER_ID,
  parseAiModelSelection,
  selectRawAiModelSetting,
} from "./model-selection";

const LOCAL_PROVIDER_IDS: readonly string[] = [OLLAMA_PROVIDER_ID, "fake"];

type EditorCapture = {
  noteId: string;
  state: EditorState;
};

type Stage =
  | { kind: "closed" }
  | { kind: "menu"; capture: EditorCapture; action: AiEditorAction | null }
  | {
      kind: "run";
      action: AiEditorAction;
      target: AiActionTarget;
      request: AiCompletionRequest;
    };

type Props = {
  store: RendererStore;
  signal: AbortSignal;
  getView: () => EditorView | null;
  getNoteId: () => string | null;
};

/**
 * Owns every transient AI editor surface. It mounts only inside the opt-in
 * gate, so with AI off no launcher, menu, preview buffer, provider module, or
 * model lookup exists at all — and nothing here runs on startup, typing, save,
 * or navigation.
 */
export function AiEditorActionHost({ store, signal, getView, getNoteId }: Props) {
  const [stage, setStage] = useState<Stage>({ kind: "closed" });
  const [blocked, setBlocked] = useState<string | null>(null);
  const [runLive, setRunLive] = useState(false);

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

  function openMenu(actionId: string | null): void {
    const view = getView();
    const noteId = getNoteId();
    if (view === null || noteId === null) {
      return;
    }
    setBlocked(null);
    setStage({
      kind: "menu",
      capture: { noteId, state: view.state },
      action: actionId === null ? null : aiEditorAction(actionId),
    });
  }

  useEffect(
    () =>
      registerAiActionListener({
        isFocused: () => getView()?.hasFocus() === true,
        open: openMenu,
      }),
    [getNoteId, getView],
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
  ): void {
    const input = actionInputText(capture.state, action.scope);
    const failure =
      aiActionInputError(action, input) ??
      aiActionInstructionError(action, instruction) ??
      (model === null ? "Choose an AI model first." : null);
    if (failure !== null || model === null) {
      setBlocked(failure);
      return;
    }
    const prompt = promptLibraryEntries(storedPrompts).find(
      (entry) => entry.builtInId === action.promptId,
    );
    if (prompt === undefined) {
      setBlocked("That prompt is missing from the library.");
      return;
    }
    const range = actionInputRange(capture.state, action.scope);
    setBlocked(null);
    setStage({
      kind: "run",
      action,
      target: { noteId: capture.noteId, from: range.from, to: range.to, input },
      request: buildAiActionRequest({
        action,
        selection: model,
        systemPrompt: prompt.systemPrompt,
        parameters: prompt.parameters,
        input,
        instruction,
        requestId: crypto.randomUUID(),
      }),
    });
  }

  return (
    <>
      <AiLauncher
        state={
          stage.kind === "run"
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
          onClose={() => setStage({ kind: "closed" })}
        />
      )}
      {stage.kind === "run" && (
        <AiRunCard
          key={stage.request.requestId}
          store={store}
          signal={signal}
          action={stage.action}
          target={stage.target}
          request={stage.request}
          modelLabel={modelLabel}
          getView={getView}
          getNoteId={getNoteId}
          onLiveChange={setRunLive}
          onClose={() => setStage({ kind: "closed" })}
        />
      )}
    </>
  );
}
