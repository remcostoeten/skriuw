import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { EditorView } from "prosemirror-view";
import { ChevronRightIcon, SparklesIcon } from "@/shared/icons/static";
import { useListboxNavigation } from "@/shared/ui/use-listbox-navigation";
import { rangeMenuAnchor, type MenuAnchor } from "@/features/editor/menu-anchor";
import {
  aiMenuRows,
  filterAiMenuRows,
  type AiMenuRow,
} from "./ai-menu-model";
import {
  aiActionInstructionError,
  aiActionUserPrompt,
  type AiEditorAction,
} from "./editor-actions";

export const AI_MENU_WIDTH = 380;

const OPEN_TRANSITION = { duration: 0.16, ease: [0.23, 1, 0.32, 1] as const };
const CLOSE_TRANSITION = { duration: 0.11, ease: [0.23, 1, 0.32, 1] as const };
const PANE_TRANSITION = { duration: 0.19, ease: [0.23, 1, 0.32, 1] as const };

/**
 * Keeps the menu attached to the range it was opened over while the window
 * moves under it. The range itself cannot change — an edit closes the menu —
 * so only the viewport is worth re-measuring.
 */
function useRangeAnchor(
  getView: () => EditorView | null,
  from: number,
  to: number,
): MenuAnchor | null {
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);

  useLayoutEffect(() => {
    function measure(): void {
      const view = getView();
      if (view === null) {
        return;
      }
      const size = view.state.doc.content.size;
      if (from > size || to > size) {
        return;
      }
      setAnchor(rangeMenuAnchor(view, from, to, AI_MENU_WIDTH));
    }
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [from, getView, to]);

  return anchor;
}

type Props = {
  getView: () => EditorView | null;
  /** The range the menu is anchored to; the caret when nothing is selected. */
  from: number;
  to: number;
  hasSelection: boolean;
  /** The text a selection action would be given, for the request preview. */
  selectionInput: string;
  noteInput: string;
  modelLabel: string | null;
  /** True when the chosen model sends the text off the device. */
  remote: boolean;
  /** Why the last attempt could not start, answered where the writer still is. */
  blocked: string | null;
  /** Opened straight onto this action's instruction step when not null. */
  initialAction: AiEditorAction | null;
  onRun: (action: AiEditorAction, instruction: string) => void;
  onChangeModel: () => void;
  onClose: () => void;
};

/**
 * The AI menu, anchored to the text it is about and layered over nothing. It
 * replaced a modal dialog: the writer has to compare a proposal against the
 * paragraph it came from, and a scrim over that paragraph made the only
 * question worth asking impossible to answer.
 */
export function AiMenu({
  getView,
  from,
  to,
  hasSelection,
  selectionInput,
  noteInput,
  modelLabel,
  remote,
  blocked,
  initialAction,
  onRun,
  onChangeModel,
  onClose,
}: Props) {
  const anchor = useRangeAnchor(getView, from, to);
  const [pending, setPending] = useState<AiEditorAction | null>(initialAction);
  const containerRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion() === true;

  useEffect(() => {
    function onPointerDown(event: PointerEvent): void {
      const target = event.target;
      if (target instanceof Node && containerRef.current?.contains(target) === true) {
        return;
      }
      onClose();
    }
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, [onClose]);

  if (anchor === null) {
    return null;
  }

  function closeAndFocus(): void {
    onClose();
    getView()?.focus();
  }

  return (
    <div
      className="ai-menu-anchor"
      data-below={anchor.below ? "true" : undefined}
      style={{ left: anchor.x, top: anchor.y }}
    >
      <motion.div
        ref={containerRef}
        className="ai-menu"
        role="dialog"
        aria-label="AI actions"
        aria-modal="false"
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={reduceMotion ? CLOSE_TRANSITION : OPEN_TRANSITION}
        style={{ transformOrigin: anchor.below ? "top center" : "bottom center" }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            if (pending === null || initialAction !== null) {
              closeAndFocus();
              return;
            }
            setPending(null);
          }
        }}
      >
        <AnimatePresence initial={false} mode="popLayout">
          {pending === null ? (
            <motion.div
              key="list"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -8 }}
              transition={PANE_TRANSITION}
            >
              <AiMenuList
                hasSelection={hasSelection}
                blocked={blocked}
                onPick={(row) => {
                  if (row.action.instruction !== null) {
                    setPending(row.action);
                    return;
                  }
                  onRun(row.action, "");
                }}
              />
            </motion.div>
          ) : (
            <motion.div
              key="compose"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 8 }}
              transition={PANE_TRANSITION}
            >
              <AiMenuCompose
                action={pending}
                input={pending.scope === "selection" ? selectionInput : noteInput}
                modelLabel={modelLabel}
                remote={remote}
                blocked={blocked}
                canGoBack={initialAction === null}
                onBack={() => setPending(null)}
                onChangeModel={onChangeModel}
                onRun={(instruction) => onRun(pending, instruction)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

type ListProps = {
  hasSelection: boolean;
  blocked: string | null;
  onPick: (row: AiMenuRow) => void;
};

function AiMenuList({ hasSelection, blocked, onPick }: ListProps) {
  const [query, setQuery] = useState("");
  const listboxId = useId();
  const all = useMemo(() => aiMenuRows(hasSelection), [hasSelection]);
  const rows = useMemo(() => filterAiMenuRows(all, query), [all, query]);

  const { activeIndex, listRef, onKeyDown, setActiveIndex } = useListboxNavigation({
    count: rows.length,
    onSelect: (index) => {
      const row = rows[index];
      if (row !== undefined && row.reason === null) {
        onPick(row);
      }
    },
  });

  return (
    <div className="ai-menu-pane">
      <div className="ai-menu-field">
        <SparklesIcon size={13} aria-hidden="true" />
        <input
          autoFocus
          className="ai-menu-input"
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
      <div ref={listRef} id={listboxId} role="listbox" aria-label="AI actions" className="ai-menu-list">
        {rows.length === 0 ? (
          <p className="ai-menu-empty">No AI action matches “{query}”</p>
        ) : (
          rows.map((row, index) => (
            <div key={row.action.id}>
              {row.heading !== null && <div className="ai-menu-heading">{row.heading}</div>}
              <button
                type="button"
                tabIndex={-1}
                id={`${listboxId}-item-${index}`}
                data-index={index}
                role="option"
                aria-selected={index === activeIndex}
                aria-disabled={row.reason !== null}
                className="ai-menu-row"
                data-active={index === activeIndex ? "true" : undefined}
                data-unavailable={row.reason !== null ? "true" : undefined}
                onMouseMove={() => setActiveIndex(index)}
                onClick={() => {
                  if (row.reason === null) {
                    onPick(row);
                  }
                }}
              >
                <span className="ai-menu-row-label">{row.action.label}</span>
                {row.reason !== null && (
                  <span className="ai-menu-row-reason">{row.reason}</span>
                )}
                {row.reason === null && row.action.instruction !== null && (
                  <ChevronRightIcon size={12} className="ai-menu-row-chevron" aria-hidden="true" />
                )}
              </button>
            </div>
          ))
        )}
      </div>
      {blocked !== null && (
        <p role="alert" className="ai-menu-error">
          {blocked}
        </p>
      )}
      <div className="ai-menu-footer">
        <span>↑↓ navigate</span>
        <span>↵ run</span>
        <span className="ai-menu-footer-end">esc close</span>
      </div>
    </div>
  );
}

type ComposeProps = {
  action: AiEditorAction;
  input: string;
  modelLabel: string | null;
  remote: boolean;
  blocked: string | null;
  canGoBack: boolean;
  onBack: () => void;
  onChangeModel: () => void;
  onRun: (instruction: string) => void;
};

function AiMenuCompose({
  action,
  input,
  modelLabel,
  remote,
  blocked,
  canGoBack,
  onBack,
  onChangeModel,
  onRun,
}: ComposeProps) {
  const [instruction, setInstruction] = useState("");
  const [showPayload, setShowPayload] = useState(false);
  // Only the instruction's own problem disables Run. A refusal from the last
  // attempt is shown but never latched: choosing a model or fixing a selection
  // happens outside this pane, and the writer has to be able to try again.
  const instructionError = aiActionInstructionError(action, instruction);
  const error = instructionError ?? blocked;
  const shape = action.instruction;

  return (
    <div className="ai-menu-pane">
      <div className="ai-menu-compose-header">
        {canGoBack && (
          <button type="button" className="ai-menu-back" onClick={onBack}>
            ← All actions
          </button>
        )}
        <span className="ai-menu-compose-title">{action.label}</span>
      </div>
      <label className="ai-menu-compose-field">
        <span className="ai-menu-compose-label">{shape?.label ?? "Instruction"}</span>
        <input
          autoFocus
          className="ai-menu-input ai-menu-input--boxed"
          value={instruction}
          placeholder={shape?.placeholder}
          onChange={(event) => setInstruction(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && instructionError === null) {
              event.preventDefault();
              onRun(instruction);
            }
          }}
        />
      </label>
      {error !== null && (
        <p role="alert" className="ai-menu-error">
          {error}
        </p>
      )}
      <button
        type="button"
        className="ai-menu-disclosure"
        aria-expanded={showPayload}
        onClick={() => setShowPayload((open) => !open)}
      >
        {showPayload ? "Hide" : "Show"} exactly what is sent
      </button>
      {showPayload && (
        <pre className="ai-menu-payload" aria-label="Request preview">
          {aiActionUserPrompt(action, input, instruction)}
        </pre>
      )}
      <div className="ai-menu-compose-actions">
        <button
          type="button"
          className="ai-menu-run"
          disabled={instructionError !== null}
          onClick={() => onRun(instruction)}
        >
          Run
        </button>
        <span className="ai-menu-model">
          {modelLabel === null
            ? "No model chosen"
            : remote
              ? `${modelLabel} · leaves your device`
              : `${modelLabel} · on your device`}
        </span>
        <button type="button" className="ai-menu-link" onClick={onChangeModel}>
          Change
        </button>
      </div>
    </div>
  );
}
