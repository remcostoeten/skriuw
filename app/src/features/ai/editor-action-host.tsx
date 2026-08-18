import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import type { AiCompletionRequest } from "@/contracts/ai";
import { Dialog, useDialogClose } from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { useListboxNavigation } from "@/shared/ui/use-listbox-navigation";
import { cn } from "@/shared/lib/utils";
import { noop } from "@/shared/lib/noop";
import { useRendererSelector } from "@/store/use-renderer-selector";
import type { RendererStore } from "@/store/types";
import { commitReferenceOperations, renameNode } from "@/store/actions/workspace";
import type { ReferenceOperation } from "@/features/references/types";
import { keptPlanItems, parseActionPlan, planApplyError, type AiPlanItem } from "./action-plan";
import {
  aiActionInstructionError,
  aiActionInputError,
  aiActionOrigin,
  aiActionUserPrompt,
  aiEditorAction,
  aiNoteActions,
  aiSelectionActions,
  buildAiActionRequest,
  type AiEditorAction,
} from "./editor-actions";
import {
  actionInputRange,
  actionInputText,
  appendTagPlanTransaction,
  appendTaskPlanTransaction,
  currentInputText,
  insertBelowTransaction,
  replaceRangeTransaction,
  type AiTagReference,
} from "./editor-action-apply";
import {
  IDLE_RUN,
  aiActionStatusLine,
  applyRefusal,
  canRetryRun,
  failedRun,
  runHasResult,
  runIsStreaming,
  runWithDelta,
  runWithTerminal,
  startedRun,
  type AiActionRun,
  type AiActionTarget,
} from "./editor-action-model";
import { registerAiActionListener } from "./editor-action-controller";
import { startAiCompletion, type AiCompletionHandle } from "./completion-bridge";
import { createAiCompletionConsumer } from "./completion-consumer";
import { requestModelSwitcher } from "./model-switcher-controller";
import { promptLibraryEntries, selectWorkspacePrompts } from "./prompt-library";
import {
  OLLAMA_PROVIDER_ID,
  parseAiModelSelection,
  selectRawAiModelSetting,
} from "./model-selection";

const LOCAL_PROVIDER_IDS: readonly string[] = [OLLAMA_PROVIDER_ID, "fake"];

const previewBoxClass =
  "max-h-[180px] min-h-[64px] overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-background px-3 py-2 font-mono text-[12px] leading-[1.55] text-foreground";
const captionClass = "text-[11px] text-theme-secondary";

type EditorCapture = {
  noteId: string;
  state: EditorState;
};

type Stage =
  | { kind: "closed" }
  | { kind: "picker"; capture: EditorCapture }
  | { kind: "action"; capture: EditorCapture; action: AiEditorAction };

type Props = {
  store: RendererStore;
  signal: AbortSignal;
  getView: () => EditorView | null;
  getNoteId: () => string | null;
};

/**
 * Owns every transient AI editor-action surface. It mounts only inside the
 * opt-in gate, so with AI off no picker, preview buffer, provider module, or
 * model lookup exists at all — and nothing here runs on startup, typing, save,
 * or navigation.
 */
export function AiEditorActionHost({ store, signal, getView, getNoteId }: Props) {
  const [stage, setStage] = useState<Stage>({ kind: "closed" });

  useEffect(
    () =>
      registerAiActionListener({
        isFocused: () => getView()?.hasFocus() === true,
        open: (actionId) => {
          const view = getView();
          const noteId = getNoteId();
          if (view === null || noteId === null) {
            return;
          }
          const capture: EditorCapture = { noteId, state: view.state };
          if (actionId === null) {
            setStage({ kind: "picker", capture });
            return;
          }
          const action = aiEditorAction(actionId);
          setStage(action === null ? { kind: "closed" } : { kind: "action", capture, action });
        },
      }),
    [getNoteId, getView],
  );

  if (stage.kind === "closed") {
    return null;
  }
  if (stage.kind === "picker") {
    return (
      <AiActionPicker
        capture={stage.capture}
        onClose={() => setStage({ kind: "closed" })}
        onPick={(action) => setStage({ kind: "action", capture: stage.capture, action })}
      />
    );
  }
  return (
    <AiActionDialog
      key={stage.action.id}
      store={store}
      signal={signal}
      action={stage.action}
      capture={stage.capture}
      getView={getView}
      getNoteId={getNoteId}
      onClose={() => setStage({ kind: "closed" })}
      onBack={() => setStage({ kind: "picker", capture: stage.capture })}
    />
  );
}

type PickerProps = {
  capture: EditorCapture;
  onClose: () => void;
  onPick: (action: AiEditorAction) => void;
};

function AiActionPicker({ capture, onClose, onPick }: PickerProps) {
  return (
    <Dialog
      open
      onOpenChange={(next) => !next && onClose()}
      title="AI actions"
      className="mx-auto mb-auto mt-[14vh] max-h-[60vh] w-[calc(100vw-1.5rem)] max-w-md overflow-hidden"
    >
      <AiActionPickerBody capture={capture} onPick={onPick} />
    </Dialog>
  );
}

type PickerRow = {
  action: AiEditorAction;
  heading: string | null;
  reason: string | null;
};

function pickerRows(capture: EditorCapture): PickerRow[] {
  const selectionInput = actionInputText(capture.state, "selection");
  const selectionReason =
    selectionInput.trim().length === 0 ? "Select some text first" : null;
  const rows: PickerRow[] = aiSelectionActions().map((action, index) => ({
    action,
    heading: index === 0 ? "Selection" : null,
    reason: selectionReason,
  }));
  for (const [index, action] of aiNoteActions().entries()) {
    rows.push({ action, heading: index === 0 ? "This note" : null, reason: null });
  }
  return rows;
}

type PickerBodyProps = {
  capture: EditorCapture;
  onPick: (action: AiEditorAction) => void;
};

function AiActionPickerBody({ capture, onPick }: PickerBodyProps) {
  const [query, setQuery] = useState("");
  const listboxId = useId();
  const closeDialog = useDialogClose();
  const all = useMemo(() => pickerRows(capture), [capture]);
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length === 0) {
      return all;
    }
    return all
      .filter((row) =>
        `${row.action.label} ${row.action.keywords.join(" ")}`.toLowerCase().includes(needle),
      )
      .map((row, index) => ({ ...row, heading: index === 0 ? "Matches" : null }));
  }, [all, query]);

  function choose(row: PickerRow | undefined): void {
    if (row === undefined) {
      return;
    }
    closeDialog();
    onPick(row.action);
  }

  const { activeIndex, listRef, onKeyDown, setActiveIndex } = useListboxNavigation({
    count: rows.length,
    onSelect: (index) => choose(rows[index]),
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-none border-b border-border px-3.5 py-2.5">
        <input
          autoFocus
          className="w-full border-none bg-transparent text-[13.5px] text-foreground outline-none placeholder:text-muted-foreground"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Rewrite, translate, extract tasks…"
          role="combobox"
          aria-expanded="true"
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            rows[activeIndex] ? `${listboxId}-item-${activeIndex}` : undefined
          }
        />
      </div>
      <div
        ref={listRef}
        id={listboxId}
        role="listbox"
        aria-label="AI actions"
        className="min-h-0 flex-auto overflow-y-auto p-1.5"
      >
        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-[13px] text-muted-foreground">
            No AI action matches “{query}”
          </p>
        ) : (
          rows.map((row, index) => (
            <div key={row.action.id}>
              {row.heading !== null && (
                <div className="px-2.5 pb-1 pt-2.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/60">
                  {row.heading}
                </div>
              )}
              <button
                type="button"
                tabIndex={-1}
                id={`${listboxId}-item-${index}`}
                data-index={index}
                role="option"
                aria-selected={index === activeIndex}
                className={cn(
                  "flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-md border-none bg-transparent px-2.5 py-2 text-left transition-colors",
                  index === activeIndex
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50",
                )}
                onMouseMove={() => setActiveIndex(index)}
                onClick={() => choose(row)}
              >
                <span className="text-[13px]">{row.action.label}</span>
                {row.reason !== null && (
                  <span className="text-[11px] text-muted-foreground">{row.reason}</span>
                )}
              </button>
            </div>
          ))
        )}
      </div>
      <div className="flex flex-none items-center gap-4 border-t border-border px-3.5 py-2 text-[11px] text-muted-foreground">
        <span>↑↓ navigate</span>
        <span>shift+↑↓ jump to ends</span>
        <span className="ml-auto">esc close</span>
      </div>
    </div>
  );
}

type DialogProps = {
  store: RendererStore;
  signal: AbortSignal;
  action: AiEditorAction;
  capture: EditorCapture;
  getView: () => EditorView | null;
  getNoteId: () => string | null;
  onClose: () => void;
  onBack: () => void;
};

function AiActionDialog(props: DialogProps) {
  return (
    <Dialog
      open
      onOpenChange={(next) => !next && props.onClose()}
      title={props.action.label}
      className="mx-auto mb-auto mt-[10vh] max-h-[80vh] w-[calc(100vw-1.5rem)] max-w-xl overflow-hidden"
    >
      <AiActionBody {...props} />
    </Dialog>
  );
}

function errorMessage(reason: unknown): string {
  if (typeof reason === "object" && reason !== null && "message" in reason) {
    return String((reason as { message: unknown }).message);
  }
  return String(reason);
}

function AiActionBody({
  store,
  signal,
  action,
  capture,
  getView,
  getNoteId,
  onBack,
}: DialogProps) {
  const closeDialog = useDialogClose();
  const [instruction, setInstruction] = useState("");
  const [run, setRun] = useState<AiActionRun>(IDLE_RUN);
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(() => new Set());
  const [applyError, setApplyError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const runRef = useRef(run);
  runRef.current = run;
  const handleRef = useRef<AiCompletionHandle | null>(null);
  const consumerRef = useRef<{ dispose: () => void } | null>(null);
  const activeRequestIdRef = useRef<string | null>(null);
  const cancelRequestedRef = useRef(false);
  const lastRequestRef = useRef<AiCompletionRequest | null>(null);
  const bufferRef = useRef("");
  const flushFrameRef = useRef<number | null>(null);
  const copiedTimerRef = useRef<number | null>(null);

  const storedPrompts = useRendererSelector(store, selectWorkspacePrompts);
  const rawModel = useRendererSelector(store, selectRawAiModelSetting);
  const model = useMemo(() => parseAiModelSelection(rawModel), [rawModel]);
  const prompt = useMemo(() => {
    const entries = promptLibraryEntries(storedPrompts);
    return entries.find((entry) => entry.builtInId === action.promptId) ?? null;
  }, [action.promptId, storedPrompts]);

  const input = useMemo(
    () => actionInputText(capture.state, action.scope),
    [action.scope, capture.state],
  );
  const target = useMemo<AiActionTarget>(() => {
    const range = actionInputRange(capture.state, action.scope);
    return { noteId: capture.noteId, from: range.from, to: range.to, input };
  }, [action.scope, capture, input]);

  const inputError = aiActionInputError(action, input);
  const instructionError = aiActionInstructionError(action, instruction);
  const userPrompt = aiActionUserPrompt(action, input, instruction);
  const streaming = runIsStreaming(run);
  const remote = model !== null && !LOCAL_PROVIDER_IDS.includes(model.providerId);
  const blocked =
    inputError ?? instructionError ?? (model === null ? "Choose an AI model first." : null);

  const plan = useMemo(() => {
    if (run.phase !== "done" || (action.outcome !== "tasks" && action.outcome !== "tags")) {
      return null;
    }
    return parseActionPlan(action.outcome, run.preview);
  }, [action.outcome, run.phase, run.preview]);
  const planItems: readonly AiPlanItem[] = plan !== null && plan.ok ? plan.items : [];
  const chosen = useMemo(() => keptPlanItems(planItems, excluded), [excluded, planItems]);

  useEffect(
    () => () => {
      consumerRef.current?.dispose();
      handleRef.current?.dispose();
      if (flushFrameRef.current !== null) {
        cancelAnimationFrame(flushFrameRef.current);
      }
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
    },
    [],
  );

  function flushDeltas(): void {
    flushFrameRef.current = null;
    const chunk = bufferRef.current;
    const requestId = activeRequestIdRef.current;
    bufferRef.current = "";
    if (chunk.length > 0 && requestId !== null) {
      setRun((current) => runWithDelta(current, requestId, chunk));
    }
  }

  function scheduleFlush(): void {
    if (flushFrameRef.current === null) {
      flushFrameRef.current = requestAnimationFrame(flushDeltas);
    }
  }

  function fire(request: AiCompletionRequest): void {
    consumerRef.current?.dispose();
    handleRef.current?.dispose();
    handleRef.current = null;
    bufferRef.current = "";
    lastRequestRef.current = request;
    activeRequestIdRef.current = request.requestId;
    cancelRequestedRef.current = false;
    setApplyError(null);
    setExcluded(new Set());
    setCopied(false);
    setRun(startedRun(request.requestId));

    const consumer = createAiCompletionConsumer(request.requestId, {
      onDelta: (text) => {
        bufferRef.current += text;
        scheduleFlush();
      },
      onTerminal: (event) => {
        flushDeltas();
        handleRef.current = null;
        setRun((current) => runWithTerminal(current, event));
      },
    });
    consumerRef.current = consumer;

    void startAiCompletion(request, aiActionOrigin(action), (event) => {
      consumer.accept(event);
    }, signal)
      .then((handle) => {
        if (activeRequestIdRef.current !== request.requestId) {
          handle.dispose();
          return;
        }
        handleRef.current = handle;
        if (cancelRequestedRef.current) {
          void handle.cancel().catch(noop);
        }
      })
      .catch((reason: unknown) => {
        if (activeRequestIdRef.current !== request.requestId) {
          return;
        }
        consumer.dispose();
        setRun((current) => failedRun(current, request.requestId, errorMessage(reason)));
      });
  }

  function submit(): void {
    if (streaming || blocked !== null || model === null || prompt === null) {
      return;
    }
    fire(
      buildAiActionRequest({
        action,
        selection: model,
        systemPrompt: prompt.systemPrompt,
        parameters: prompt.parameters,
        input,
        instruction,
        requestId: crypto.randomUUID(),
      }),
    );
  }

  function retry(): void {
    const previous = lastRequestRef.current;
    if (streaming || previous === null) {
      return;
    }
    fire({ ...previous, requestId: crypto.randomUUID() });
  }

  function cancelRun(): void {
    cancelRequestedRef.current = true;
    void handleRef.current?.cancel().catch(noop);
  }

  function copyResult(): void {
    void navigator.clipboard
      ?.writeText(run.preview)
      .then(() => {
        setCopied(true);
        if (copiedTimerRef.current !== null) {
          window.clearTimeout(copiedTimerRef.current);
        }
        copiedTimerRef.current = window.setTimeout(() => setCopied(false), 1600);
      })
      .catch(noop);
  }

  /**
   * Everything that writes to the document goes through here so a stale result
   * is refused in exactly one place, whatever the writer pressed.
   */
  function withLiveEditor(apply: (view: EditorView) => string | null): void {
    const view = getView();
    if (view === null) {
      setApplyError("The editor is not available. Run the action again.");
      return;
    }
    const refusal = applyRefusal(
      target,
      getNoteId(),
      currentInputText(view.state, target, action.scope),
    );
    if (refusal !== null) {
      setApplyError(refusal);
      return;
    }
    const failure = apply(view);
    if (failure !== null) {
      setApplyError(failure);
      return;
    }
    closeDialog();
    view.focus();
  }

  function replaceSelection(): void {
    withLiveEditor((view) => {
      view.dispatch(
        replaceRangeTransaction(view.state, target.from, target.to, run.preview.trim()),
      );
      return null;
    });
  }

  function insertBelow(): void {
    withLiveEditor((view) => {
      view.dispatch(insertBelowTransaction(view.state, target.to, run.preview.trim()));
      return null;
    });
  }

  function renameFromResult(): void {
    const title = run.preview.trim().split("\n")[0]?.trim() ?? "";
    if (title.length === 0) {
      setApplyError("The model returned an empty title.");
      return;
    }
    withLiveEditor(() => {
      renameNode(store, target.noteId, title);
      return null;
    });
  }

  function applyTaskPlan(): void {
    const failure = planApplyError("tasks", chosen);
    if (failure !== null) {
      setApplyError(failure);
      return;
    }
    withLiveEditor((view) => {
      const transaction = appendTaskPlanTransaction(view.state, chosen);
      if (transaction === null) {
        return "Those tasks could not be added to this note.";
      }
      view.dispatch(transaction);
      return null;
    });
  }

  function applyTagPlan(): void {
    const failure = planApplyError("tags", chosen);
    if (failure !== null) {
      setApplyError(failure);
      return;
    }
    const state = store.getState();
    const existing = new Map(
      [...state.tags.values()].map((tag) => [tag.name.toLowerCase(), tag] as const),
    );
    const now = Date.now();
    const creations: ReferenceOperation[] = [];
    const references: AiTagReference[] = [];
    for (const item of chosen) {
      const match = existing.get(item.text.toLowerCase());
      if (match !== undefined) {
        references.push({ id: match.id, name: match.name });
        continue;
      }
      const id = crypto.randomUUID();
      creations.push({
        type: "create_tag",
        tag: {
          id,
          name: item.text,
          color: null,
          createdAt: now,
          updatedAt: now,
          createdIn: target.noteId,
        },
      });
      references.push({ id, name: item.text });
    }
    withLiveEditor((view) => {
      const transaction = appendTagPlanTransaction(view.state, references);
      if (transaction === null) {
        return "Those tags could not be added to this note.";
      }
      if (creations.length > 0) {
        commitReferenceOperations(store, creations);
      }
      view.dispatch(transaction);
      return null;
    });
  }

  function togglePlanItem(key: string): void {
    setExcluded((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  const statusLine = aiActionStatusLine(run, action);
  const showResult = runHasResult(run);
  const planMessage = plan !== null && !plan.ok ? plan.message : null;
  const isPlan = action.outcome === "tasks" || action.outcome === "tags";

  return (
    <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-3.5 py-3">
      <p role="status" aria-live="polite" className={cn(captionClass, "min-h-4")}>
        {statusLine}
      </p>

      {run.phase === "composing" && (
        <>
          {action.instruction !== null && (
            <label className="block">
              <span className="mb-1 block text-[11px] font-[560] text-theme-secondary">
                {action.instruction.label}
              </span>
              <input
                autoFocus
                className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-[13px] text-foreground outline-none focus:border-ring"
                value={instruction}
                placeholder={action.instruction.placeholder}
                onChange={(event) => setInstruction(event.target.value)}
              />
            </label>
          )}
          <div>
            <p className={cn(captionClass, "mb-1")}>
              {model === null
                ? "No model chosen yet."
                : remote
                  ? `Sent to ${model.providerId} · ${model.modelId}. This text leaves your device.`
                  : `Sent to ${model.providerId} · ${model.modelId}. This runs on your device.`}
            </p>
            <p className={cn(captionClass, "mb-1")}>This is exactly what is sent:</p>
            <div aria-label="Request preview" className={previewBoxClass}>
              {userPrompt}
            </div>
          </div>
        </>
      )}

      {run.phase !== "composing" && (
        <div aria-label="Model output" className={previewBoxClass}>
          {run.preview.length === 0 ? (
            <span className="text-theme-dim">
              {streaming ? "Waiting for the first words…" : "Nothing was produced."}
            </span>
          ) : (
            run.preview
          )}
        </div>
      )}

      {showResult && isPlan && plan !== null && plan.ok && (
        <fieldset className="rounded-lg border border-border px-3 py-2">
          <legend className={cn(captionClass, "px-1")}>
            {action.outcome === "tasks" ? "Tasks to add" : "Tags to add"}
          </legend>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {plan.items.map((item) => (
              <li key={item.key}>
                <label className="flex cursor-pointer items-start gap-2 text-[13px] text-foreground">
                  <input
                    type="checkbox"
                    className="mt-[3px]"
                    checked={!excluded.has(item.key)}
                    onChange={() => togglePlanItem(item.key)}
                  />
                  <span>{action.outcome === "tags" ? `#${item.text}` : item.text}</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      )}

      {blocked !== null && run.phase === "composing" && (
        <p role="alert" className="text-[11.5px] text-destructive">
          {blocked}
        </p>
      )}
      {planMessage !== null && (
        <p role="alert" className="text-[11.5px] text-destructive">
          {planMessage}
        </p>
      )}
      {applyError !== null && (
        <p role="alert" className="text-[11.5px] text-destructive">
          {applyError}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {run.phase === "composing" && (
          <Button variant="primary" onClick={submit} disabled={blocked !== null}>
            Run
          </Button>
        )}
        {streaming && <Button onClick={cancelRun}>Cancel</Button>}
        {showResult && !isPlan && action.outcome === "title" && (
          <Button variant="primary" onClick={renameFromResult}>
            Rename note
          </Button>
        )}
        {showResult && !isPlan && action.outcome === "text" && (
          <>
            <Button variant="primary" onClick={replaceSelection}>
              {action.scope === "selection" ? "Replace selection" : "Replace note"}
            </Button>
            <Button onClick={insertBelow}>Insert below</Button>
          </>
        )}
        {showResult && isPlan && plan !== null && plan.ok && (
          <Button
            variant="primary"
            onClick={action.outcome === "tasks" ? applyTaskPlan : applyTagPlan}
          >
            {action.outcome === "tasks"
              ? `Add ${chosen.length} task${chosen.length === 1 ? "" : "s"}`
              : `Add ${chosen.length} tag${chosen.length === 1 ? "" : "s"}`}
          </Button>
        )}
        {run.phase !== "composing" && (
          <Button onClick={copyResult} disabled={run.preview.length === 0}>
            {copied ? "Copied" : "Copy"}
          </Button>
        )}
        {canRetryRun(run) && <Button onClick={retry}>Retry</Button>}
        {run.phase === "composing" && <Button onClick={onBack}>Other actions</Button>}
        <Button onClick={() => closeDialog()}>
          {run.phase === "composing" ? "Cancel" : "Discard"}
        </Button>
        {model !== null && run.phase === "composing" && (
          <button
            type="button"
            className="cursor-pointer border-none bg-transparent p-0 text-[11px] text-theme-secondary underline underline-offset-2"
            onClick={requestModelSwitcher}
          >
            Change model
          </button>
        )}
      </div>
      <p className={captionClass}>
        Nothing is written to the note until you choose. Discarding leaves it unchanged.
      </p>
    </div>
  );
}
