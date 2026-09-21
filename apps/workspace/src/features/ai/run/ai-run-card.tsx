import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { EditorView } from "prosemirror-view";
import { detectPlatform } from "@remcostoeten/use-shortcut/constants";
import { noop } from "@/shared/lib/noop";
import { diffWords, type DiffSegment } from "@/shared/lib/word-diff";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { KeyCaps } from "@/shared/ui/key-caps";
import { setSuggestionPreview } from "@/features/editor/suggestion-decorations";
import { commitReferenceOperations, renameNode } from "@/store/actions/workspace";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import type { ReferenceOperation } from "@skriuw/renderer-core/references/types";
import { keptPlanItems, parseActionPlan, planApplyError, type AiPlanItem } from "@/features/ai/actions/action-plan";
import { diagramResultParts, diagramResultText } from "@/features/ai/actions/diagram-repair";
import type { AiEditorAction } from "@/features/ai/actions/editor-actions";
import {
  appendTagPlanTransaction,
  appendTaskPlanTransaction,
  insertBelowTransaction,
  liveEditorRefusal,
  replaceRangeTransaction,
  type AiTagReference,
} from "@/features/ai/actions/editor-action-apply";
import {
  aiActionStatusLine,
  canRetryRun,
  runHasResult,
  runIsStreaming,
  type AiActionTarget,
} from "@/features/ai/actions/editor-action-model";
import {
  aiErrorHint,
  aiRunElapsedLabel,
  aiRunIsAbortable,
  aiRunStallNote,
  aiRunSteps,
  aiRunTone,
} from "./run-progress";
import type { RunSession } from "./run-session";
import { useRunSession } from "./use-ai-run";
import { AiRunResultBody } from "./ai-run-result-body";

type Props = {
  store: RendererStore;
  action: AiEditorAction;
  target: AiActionTarget;
  /** Owned by the run registry, which outlives this card; it is never disposed here. */
  session: RunSession;
  modelLabel: string | null;
  getView: () => EditorView | null;
  getNoteId: () => string | null;
  /** Reports whether the provider is still working, for the launcher's label. */
  onLiveChange: (live: boolean) => void;
  onClose: () => void;
};

function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

const PRIMARY_ACTION = "skriuw-suggestion-primary";
const QUIET_ACTION = "skriuw-suggestion-quiet";

function applyKeys(): string[] {
  return detectPlatform() === "mac" ? ["⌘", "↵"] : ["Ctrl", "↵"];
}

function createHost(): HTMLDivElement {
  const host = document.createElement("div");
  host.className = "skriuw-suggestion";
  host.contentEditable = "false";
  host.setAttribute("role", "group");
  host.setAttribute("aria-label", "AI run");
  return host;
}

/**
 * A clock that only runs while the card needs one. Elapsed time is the only
 * honest progress signal a stream can offer before its first token, so it ticks
 * at a rate a reader can follow and stops dead the moment the run settles.
 */
function useRunClock(active: boolean): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!active) {
      return;
    }
    setNow(performance.now());
    const timer = window.setInterval(() => setNow(performance.now()), 100);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

/**
 * Every AI run, from the request leaving to the result being accepted, in one
 * card painted over the note. Nothing here writes to the document until the
 * writer says so, so stopping, failing, and discarding are all the same
 * outcome for the note: unchanged.
 */
export function AiRunCard({
  store,
  action,
  target,
  session,
  modelLabel,
  getView,
  getNoteId,
  onLiveChange,
  onClose,
}: Props) {
  const run = useRunSession(session);
  const { retry, cancel } = session;
  // A card can mount onto a run that started before the writer left the note.
  // What the run would apply to is checked on the way back in, so a range that
  // moved meanwhile is refused where the writer can read it, not on accept.
  const [applyError, setApplyError] = useState<string | null>(() => {
    const view = getView();
    if (view === null || getNoteId() !== target.noteId) {
      return null;
    }
    return liveEditorRefusal(view.state, target, action.scope, getNoteId());
  });
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(() => new Set());
  const [copied, setCopied] = useState(false);
  const [seenRequestId, setSeenRequestId] = useState(run.requestId);
  if (seenRequestId !== run.requestId) {
    setSeenRequestId(run.requestId);
    setApplyError(null);
    setExcluded(new Set());
    setCopied(false);
  }

  const hostRef = useRef<HTMLDivElement | null>(null);
  hostRef.current ??= createHost();
  const host = hostRef.current;
  const sessionKey = useMemo(() => crypto.randomUUID(), []);
  const copiedTimerRef = useRef<number | null>(null);
  const closedRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const streaming = runIsStreaming(run);
  const settled = !streaming && run.phase !== "composing";
  const showResult = runHasResult(run);
  const isPlan = action.outcome === "tasks" || action.outcome === "tags";
  const isReplacement = action.outcome === "text";
  const now = useRunClock(streaming);
  const elapsed = aiRunElapsedLabel(run.startedAt, now);
  const stall = aiRunStallNote(run, now);
  const steps = useMemo(() => aiRunSteps(run, modelLabel), [modelLabel, run]);
  const failure =
    run.phase === "error" || run.phase === "timeout" || run.phase === "cancelled"
      ? aiActionStatusLine(run, action)
      : null;
  const hint = run.phase === "error" ? aiErrorHint(run.error) : null;
  const tone = aiRunTone(run);

  useLayoutEffect(() => {
    host.dataset.tone = tone;
  }, [host, tone]);

  const onLiveChangeRef = useRef(onLiveChange);
  onLiveChangeRef.current = onLiveChange;
  useEffect(() => {
    onLiveChangeRef.current(streaming);
    return () => onLiveChangeRef.current(false);
  }, [streaming]);

  useEffect(
    () => () => {
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
    },
    [],
  );

  function close(): void {
    if (closedRef.current) {
      return;
    }
    closedRef.current = true;
    onCloseRef.current();
  }

  // The card is painted by the editor, so every change to what it says about
  // the range has to be pushed back in. Clearing is deliberately not this
  // effect's cleanup: a redraw would then read as a dismissal and end the
  // review the moment the run settled.
  //
  // Only a replacement strikes the range through. A summary, a title, or a
  // task list adds to the note rather than replacing anything, so marking the
  // text it read as doomed would be a lie.
  //
  // The dismissal the plugin reports is "the editor dropped this preview",
  // which is only a review ending when the editor dropped it on its own. Our
  // own teardown also drops it, and under a double-invoked effect that teardown
  // runs between two mounts — closing the card in the same tick it opened.
  // The guard tells the two apart.
  //
  // When the note comes back, this card mounts in the same commit that swaps
  // the note into the editor, and its effect runs before the editor's does. A
  // first attempt that finds the editor still showing the previous note waits
  // one microtask, by which point the swap has landed.
  const tearingDownRef = useRef(false);
  useEffect(() => {
    tearingDownRef.current = false;
    const strikes = isReplacement && action.scope === "selection";
    function attach(): boolean {
      const view = getView();
      if (view === null || getNoteId() !== target.noteId) {
        return false;
      }
      setSuggestionPreview(view, {
        key: sessionKey,
        from: strikes ? target.from : target.to,
        to: target.to,
        host,
        settled,
        onDismiss: () => {
          if (!tearingDownRef.current) {
            close();
          }
        },
      });
      return true;
    }
    if (!attach()) {
      queueMicrotask(() => {
        if (!tearingDownRef.current) {
          attach();
        }
      });
    }
    return () => {
      tearingDownRef.current = true;
    };
  }, [action.scope, getNoteId, getView, host, isReplacement, sessionKey, settled, target.from, target.noteId, target.to]);

  useEffect(
    () => () => {
      const view = getView();
      if (view !== null) {
        setSuggestionPreview(view, null);
      }
    },
    [getView],
  );

  const plan = useMemo(() => {
    if (run.phase !== "done" || !isPlan) {
      return null;
    }
    const outcome = action.outcome === "tasks" ? "tasks" : "tags";
    return parseActionPlan(outcome, run.preview);
  }, [action.outcome, isPlan, run.phase, run.preview]);
  const planItems: readonly AiPlanItem[] = plan !== null && plan.ok ? plan.items : [];
  const chosen = useMemo(() => keptPlanItems(planItems, excluded), [excluded, planItems]);

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
    const refusal = liveEditorRefusal(view.state, target, action.scope, getNoteId());
    if (refusal !== null) {
      setApplyError(refusal);
      return;
    }
    // The preview is torn down only once the change has actually landed. An
    // apply that refuses itself — an empty title, a plan that cannot be built —
    // has to leave the card standing, or the writer never reads why.
    const failure = apply(view);
    if (failure !== null) {
      setApplyError(failure);
      return;
    }
    setSuggestionPreview(view, null);
    close();
    view.focus();
  }

  function accept(): void {
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

  function insertDiagram(): void {
    withLiveEditor((view) => {
      view.dispatch(
        insertBelowTransaction(view.state, target.to, diagramResultText(run.preview)),
      );
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
    const at = Date.now();
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
          createdAt: at,
          updatedAt: at,
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

  function discard(): void {
    if (aiRunIsAbortable(run)) {
      cancel();
    }
    const view = getView();
    if (view !== null) {
      setSuggestionPreview(view, null);
      view.focus();
    }
    close();
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

  const segments = useMemo<readonly DiffSegment[]>(() => {
    if (!showResult || !isReplacement) {
      return [];
    }
    return diffWords(target.input, run.preview.trim()).after;
  }, [isReplacement, run.preview, showResult, target.input]);

  const hasDiagram =
    showResult && diagramResultParts(run.preview).some((part) => part.kind === "diagram");

  const isRewrite =
    hasDiagram ||
    segments.every((segment) => segment.changed || segment.text.trim().length === 0);

  const addedWords = useMemo(() => {
    if (!showResult || !isReplacement) {
      return 0;
    }
    return wordCount(run.preview) - wordCount(target.input);
  }, [isReplacement, run.preview, showResult, target.input]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        discard();
        return;
      }
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && showResult) {
        event.preventDefault();
        if (isReplacement) {
          accept();
        } else if (action.outcome === "diagram") {
          insertDiagram();
        } else if (action.outcome === "title") {
          renameFromResult();
        } else if (action.outcome === "tasks") {
          applyTaskPlan();
        } else {
          applyTagPlan();
        }
      }
    };
    host.addEventListener("keydown", handleKeyDown);
    return () => host.removeEventListener("keydown", handleKeyDown);
  });

  const planMessage = plan !== null && !plan.ok ? plan.message : null;

  return createPortal(
    <>
      <div className="skriuw-suggestion-header">
        <span className="skriuw-suggestion-tone" aria-hidden="true" />
        <span className="skriuw-suggestion-label">{action.label}</span>
        {modelLabel !== null && (
          <span className="skriuw-suggestion-model">{modelLabel}</span>
        )}
        <span role="status" aria-live="polite" className="sr-only">
          {aiActionStatusLine(run, action)}
        </span>
        <span className="skriuw-suggestion-count">
          {streaming
            ? `${elapsed ?? ""}${elapsed !== null && run.preview.length > 0 ? " · " : ""}${
                run.preview.length > 0 ? `${run.preview.length} chars` : ""
              }`
            : showResult && isReplacement
              ? `${addedWords >= 0 ? "+" : ""}${addedWords} words`
              : ""}
        </span>
      </div>

      {(streaming || failure !== null) && (
        <ol className="skriuw-run-steps" aria-label="Run progress">
          {steps.map((step) => (
            <li key={step.id} className="skriuw-run-step" data-state={step.state}>
              <span className="skriuw-run-step-dot" aria-hidden="true" />
              <span className="skriuw-run-step-label">{step.label}</span>
            </li>
          ))}
        </ol>
      )}

      {streaming && run.preview.length === 0 && (
        <div className="skriuw-run-skeleton" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      )}

      {(run.preview.length > 0 || (settled && failure === null)) && (
        <div
          className="skriuw-suggestion-text"
          data-empty={!streaming && run.preview.length === 0 ? "" : undefined}
        >
          {showResult && isReplacement && !isRewrite ? (
            segments.map((segment, index) => (
              <span
                key={`${index}-${segment.changed}`}
                className={segment.changed ? "skriuw-suggestion-word" : undefined}
              >
                {segment.text}
              </span>
            ))
          ) : (
            <>
              {streaming ? run.preview : <AiRunResultBody text={run.preview.trim()} />}
              {streaming && <span className="skriuw-suggestion-caret" aria-hidden="true" />}
              {!streaming && run.preview.length === 0 && (
                <span className="text-theme-dim">Nothing was produced.</span>
              )}
            </>
          )}
        </div>
      )}

      {showResult && isPlan && plan !== null && plan.ok && (
        <fieldset className="skriuw-run-plan">
          <legend>{action.outcome === "tasks" ? "Tasks to add" : "Tags to add"}</legend>
          <ul>
            {plan.items.map((item) => (
              <li key={item.key}>
                <label>
                  <Checkbox
                    checked={!excluded.has(item.key)}
                    onChange={() =>
                      setExcluded((current) => {
                        const next = new Set(current);
                        if (next.has(item.key)) {
                          next.delete(item.key);
                        } else {
                          next.add(item.key);
                        }
                        return next;
                      })
                    }
                  />
                  <span>{action.outcome === "tags" ? `#${item.text}` : item.text}</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      )}

      {stall !== null && <p className="skriuw-run-stall">{stall}</p>}

      {(applyError ?? failure ?? planMessage) !== null && (
        <div role="alert" className="skriuw-suggestion-error">
          <span>{applyError ?? failure ?? planMessage}</span>
          {hint !== null && <span className="skriuw-run-hint">{hint}</span>}
        </div>
      )}

      <div className="skriuw-suggestion-actions">
        {showResult && isReplacement && (
          <>
            <Button className={PRIMARY_ACTION} onClick={accept}>
              {action.scope === "selection" ? "Replace selection" : "Replace note"}
              <KeyCaps keys={applyKeys()} />
            </Button>
            <Button className={QUIET_ACTION} onClick={insertBelow}>
              Insert below
            </Button>
          </>
        )}
        {showResult && action.outcome === "diagram" && (
          <Button className={PRIMARY_ACTION} onClick={insertDiagram}>
            Insert diagram
            <KeyCaps keys={applyKeys()} />
          </Button>
        )}
        {showResult && action.outcome === "title" && (
          <Button className={PRIMARY_ACTION} onClick={renameFromResult}>
            Rename note
            <KeyCaps keys={applyKeys()} />
          </Button>
        )}
        {showResult && isPlan && plan !== null && plan.ok && (
          <Button
            className={PRIMARY_ACTION}
            onClick={action.outcome === "tasks" ? applyTaskPlan : applyTagPlan}
          >
            {action.outcome === "tasks"
              ? `Add ${chosen.length} task${chosen.length === 1 ? "" : "s"}`
              : `Add ${chosen.length} tag${chosen.length === 1 ? "" : "s"}`}
            <KeyCaps keys={applyKeys()} />
          </Button>
        )}
        {aiRunIsAbortable(run) && (
          <Button className={QUIET_ACTION} onClick={cancel}>
            Stop
          </Button>
        )}
        {!streaming && run.preview.length > 0 && (
          <Button className={QUIET_ACTION} onClick={copyResult}>
            {copied ? "Copied" : "Copy"}
          </Button>
        )}
        {canRetryRun(run) && (
          <Button className={QUIET_ACTION} onClick={retry}>
            Retry
          </Button>
        )}
        <Button className={`${QUIET_ACTION} skriuw-suggestion-discard`} onClick={discard}>
          Discard
          <KeyCaps keys={["esc"]} />
        </Button>
      </div>
    </>,
    host,
  );
}
