import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { EditorView } from "prosemirror-view";
import type { AiCompletionRequest } from "@/contracts/ai";
import { Button } from "@/shared/ui/button";
import { noop } from "@/shared/lib/noop";
import { diffWords, type DiffSegment } from "@/shared/lib/word-diff";
import { setSuggestionPreview } from "@/features/editor/suggestion-decorations";
import { aiActionOrigin, type AiEditorAction } from "./editor-actions";
import {
  insertBelowTransaction,
  liveEditorRefusal,
  replaceRangeTransaction,
} from "./editor-action-apply";
import {
  aiActionStatusLine,
  canRetryRun,
  runHasResult,
  runIsStreaming,
  type AiActionTarget,
} from "./editor-action-model";
import { useAiRun } from "./use-ai-run";

type Props = {
  signal: AbortSignal;
  action: AiEditorAction;
  target: AiActionTarget;
  request: AiCompletionRequest;
  getView: () => EditorView | null;
  getNoteId: () => string | null;
  onClose: () => void;
};

function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

function createHost(): HTMLDivElement {
  const host = document.createElement("div");
  host.className = "skriuw-suggestion";
  host.contentEditable = "false";
  host.setAttribute("role", "group");
  host.setAttribute("aria-label", "AI suggestion");
  return host;
}

/**
 * Reviews a text result where the writer is already looking: the range it would
 * replace is struck through in the note and the proposal renders directly below
 * it, word-diffed against the original. The document is never written to until
 * the writer accepts, so discarding is not an undo — nothing happened.
 */
export function AiInlineSuggestion({
  signal,
  action,
  target,
  request,
  getView,
  getNoteId,
  onClose,
}: Props) {
  const [applyError, setApplyError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { run, fire, retry, cancel } = useAiRun(signal, {
    origin: aiActionOrigin(action),
    onStart: () => {
      setApplyError(null);
      setCopied(false);
    },
  });

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
  const runFailure =
    run.phase === "error" || run.phase === "timeout" || run.phase === "cancelled"
      ? aiActionStatusLine(run, action)
      : null;

  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) {
      return;
    }
    startedRef.current = true;
    fire(request);
  }, [fire, request]);

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
  useEffect(() => {
    const view = getView();
    if (view === null) {
      return;
    }
    setSuggestionPreview(view, {
      key: sessionKey,
      from: action.scope === "selection" ? target.from : target.to,
      to: target.to,
      host,
      settled,
      onDismiss: close,
    });
  }, [action.scope, getView, host, sessionKey, settled, target.from, target.to]);

  useEffect(
    () => () => {
      const view = getView();
      if (view !== null) {
        setSuggestionPreview(view, null);
      }
    },
    [getView],
  );

  function withLiveEditor(apply: (view: EditorView) => void): void {
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
    setSuggestionPreview(view, null);
    apply(view);
    close();
    view.focus();
  }

  function accept(): void {
    withLiveEditor((view) => {
      view.dispatch(
        replaceRangeTransaction(view.state, target.from, target.to, run.preview.trim()),
      );
    });
  }

  function insertBelow(): void {
    withLiveEditor((view) => {
      view.dispatch(insertBelowTransaction(view.state, target.to, run.preview.trim()));
    });
  }

  function discard(): void {
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
    if (!showResult) {
      return [];
    }
    return diffWords(target.input, run.preview.trim()).after;
  }, [run.preview, showResult, target.input]);

  const addedWords = useMemo(() => {
    if (!showResult) {
      return 0;
    }
    return wordCount(run.preview) - wordCount(target.input);
  }, [run.preview, showResult, target.input]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        discard();
        return;
      }
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && showResult) {
        event.preventDefault();
        accept();
      }
    };
    host.addEventListener("keydown", handleKeyDown);
    return () => host.removeEventListener("keydown", handleKeyDown);
  });

  return createPortal(
    <>
      <div className="skriuw-suggestion-header">
        <span className="skriuw-suggestion-label">{action.label}</span>
        <span role="status" aria-live="polite" className="sr-only">
          {aiActionStatusLine(run, action)}
        </span>
        <span className="skriuw-suggestion-count">
          {streaming
            ? `${run.preview.length} characters…`
            : showResult
              ? `${addedWords >= 0 ? "+" : ""}${addedWords} words`
              : ""}
        </span>
      </div>

      <div className="skriuw-suggestion-text">
        {showResult ? (
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
            {run.preview}
            {streaming && <span className="skriuw-suggestion-caret" aria-hidden="true" />}
            {!streaming && run.preview.length === 0 && (
              <span className="text-theme-dim">Nothing was produced.</span>
            )}
          </>
        )}
      </div>

      {(applyError ?? runFailure) !== null && (
        <p role="alert" className="skriuw-suggestion-error">
          {applyError ?? runFailure}
        </p>
      )}

      <div className="skriuw-suggestion-actions">
        {streaming && <Button onClick={cancel}>Stop</Button>}
        {showResult && (
          <>
            <Button variant="primary" onClick={accept}>
              {action.scope === "selection" ? "Replace selection" : "Replace note"}
            </Button>
            <Button onClick={insertBelow}>Insert below</Button>
          </>
        )}
        {!streaming && run.preview.length > 0 && (
          <Button onClick={copyResult}>{copied ? "Copied" : "Copy"}</Button>
        )}
        {canRetryRun(run) && <Button onClick={retry}>Retry</Button>}
        <Button onClick={discard}>Discard</Button>
        <span className="skriuw-suggestion-hint">
          {showResult ? "⌘↵ replace · esc discard" : "esc discard"}
        </span>
      </div>
    </>,
    host,
  );
}
