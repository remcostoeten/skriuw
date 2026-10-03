import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import type { EditorView } from "prosemirror-view";
import { ChevronRightIcon, SettingsIcon, SparklesIcon } from "@/shared/icons/static";
import { useListboxNavigation } from "@/shared/ui/use-listbox-navigation";
import { placeAiMenu, type AiMenuGeometry, type Box } from "./placement";
import { aiMenuRows, filterAiMenuRows, type AiMenuRow } from "./model";
import {
  aiActionInstructionError,
  aiActionUserPrompt,
  type AiEditorAction,
} from "@/features/ai/actions/catalog";

export const AI_MENU_WIDTH = 380;
const AI_MENU_CHROME_HEIGHT = 96;

const OPEN_TRANSITION = { duration: 0.16, ease: [0.23, 1, 0.32, 1] as const };
const PANE_TRANSITION = { duration: 0.19, ease: [0.23, 1, 0.32, 1] as const };

function toBox(rect: { top: number; bottom: number; left: number; right: number }): Box {
  return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
}

/**
 * Keeps the menu attached to the range it was opened over while the window
 * moves under it. The range itself cannot change — an edit closes the menu —
 * so only the viewport is worth re-measuring.
 */
function useRangeGeometry(
  getView: () => EditorView | null,
  from: number,
  to: number,
): AiMenuGeometry | null {
  const [geometry, setGeometry] = useState<AiMenuGeometry | null>(null);

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
      const viewport = { top: 0, left: 0, bottom: window.innerHeight, right: window.innerWidth };
      const pane = view.dom.closest<HTMLElement>(".editor-pane")?.getBoundingClientRect();
      const bounds =
        pane === undefined
          ? viewport
          : {
              top: Math.max(pane.top, viewport.top),
              bottom: Math.min(pane.bottom, viewport.bottom),
              left: Math.max(pane.left, viewport.left),
              right: Math.min(pane.right, viewport.right),
            };
      setGeometry({
        start: toBox(view.coordsAtPos(from)),
        end: toBox(view.coordsAtPos(to)),
        column: toBox(view.dom.getBoundingClientRect()),
        bounds,
        viewport,
      });
    }
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [from, getView, to]);

  return geometry;
}

function useElementSize(
  ref: RefObject<HTMLElement | null>,
  mounted: boolean,
): { width: number; height: number } | null {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) {
      return;
    }
    function read(): void {
      if (element !== null) {
        setSize({ width: element.offsetWidth, height: element.offsetHeight });
      }
    }
    read();
    const observer = new ResizeObserver(read);
    observer.observe(element);
    return () => observer.disconnect();
  }, [mounted, ref]);

  return size;
}

type AiMenuProps = {
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
  onOpenSettings: () => void;
  onOpenPrompts: () => void;
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
  onOpenSettings,
  onOpenPrompts,
  onClose,
}: AiMenuProps) {
  const geometry = useRangeGeometry(getView, from, to);
  const [pending, setPending] = useState<AiEditorAction | null>(initialAction);
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const measured = useElementSize(frameRef, geometry !== null);

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

  if (geometry === null) {
    return null;
  }

  const naturalHeight = window.innerHeight * 0.46 + AI_MENU_CHROME_HEIGHT;
  const size = measured ?? {
    width: Math.min(AI_MENU_WIDTH, window.innerWidth - 24),
    height: naturalHeight,
  };
  const placement = placeAiMenu(geometry, hasSelection, size, naturalHeight);

  function closeAndFocus(): void {
    onClose();
    getView()?.focus();
  }

  return (
    <div
      ref={frameRef}
      className="fixed z-40"
      style={
        {
          left: placement.left,
          top: placement.top,
          "--ai-menu-room": `${placement.room}px`,
        } as CSSProperties
      }
    >
      <motion.div
        ref={containerRef}
        className="w-[min(380px,calc(100vw-24px))] overflow-hidden rounded-[calc(var(--radius)+3px)] border border-border bg-popover font-sans text-popover-foreground shadow-[0_14px_40px_hsl(var(--scrim)/0.3)]"
        role="dialog"
        aria-label="AI actions"
        aria-modal="false"
        initial={{ opacity: 0, scale: 0.97, y: 4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={OPEN_TRANSITION}
        style={{ transformOrigin: placement.below ? "top center" : "bottom center" }}
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
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={PANE_TRANSITION}
            >
              <AiMenuList
                hasSelection={hasSelection}
                blocked={blocked}
                modelLabel={modelLabel}
                onChangeModel={onChangeModel}
                onOpenSettings={onOpenSettings}
                onOpenPrompts={onOpenPrompts}
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
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
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
  modelLabel: string | null;
  onChangeModel: () => void;
  onOpenSettings: () => void;
  onOpenPrompts: () => void;
  onPick: (row: AiMenuRow) => void;
};

function AiMenuList({
  hasSelection,
  blocked,
  modelLabel,
  onChangeModel,
  onOpenSettings,
  onOpenPrompts,
  onPick,
}: ListProps) {
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
    <div className="flex flex-col">
      <div className="flex items-center gap-[7px] border-b border-border/80 px-3 py-[9px] text-[hsl(var(--editor-link))]">
        <SparklesIcon size={13} aria-hidden="true" />
        <input
          autoFocus
          className="w-full bg-transparent text-[13.5px] text-foreground outline-none placeholder:text-muted-foreground"
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
          aria-activedescendant={rows[activeIndex] ? `${listboxId}-item-${activeIndex}` : undefined}
        />
      </div>
      <div
        ref={listRef}
        id={listboxId}
        role="listbox"
        aria-label="AI actions"
        className="max-h-[max(120px,min(46dvh,calc(var(--ai-menu-room,100dvh)-96px)))] overflow-y-auto p-[5px] [scrollbar-width:thin]"
      >
        {rows.length === 0 ? (
          <p className="px-4 py-[34px] text-center text-[13px] text-muted-foreground">
            No AI action matches “{query}”
          </p>
        ) : (
          rows.map((row, index) => (
            <div key={row.action.id}>
              {row.heading !== null && (
                <div className="px-[9px] pt-2 pb-[3px] text-[10px] font-[560] uppercase tracking-[0.12em] text-muted-foreground/70">
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
                aria-disabled={row.reason !== null}
                className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-[9px] py-1.5 text-left text-[13px] text-sidebar-foreground transition-colors duration-[110ms] data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[unavailable=true]:cursor-default data-[unavailable=true]:opacity-55"
                data-active={index === activeIndex ? "true" : undefined}
                data-unavailable={row.reason !== null ? "true" : undefined}
                onMouseMove={() => setActiveIndex(index)}
                onClick={() => {
                  if (row.reason === null) {
                    onPick(row);
                  }
                }}
              >
                <span className="flex-auto">{row.action.label}</span>
                {row.reason !== null && (
                  <span className="flex-none text-[11px] text-muted-foreground">{row.reason}</span>
                )}
                {row.reason === null && row.action.instruction !== null && (
                  <ChevronRightIcon
                    size={12}
                    className="flex-none text-muted-foreground"
                    aria-hidden="true"
                  />
                )}
              </button>
            </div>
          ))
        )}
      </div>
      {blocked !== null && (
        <p role="alert" className="px-3 pb-2 text-[11.5px] text-destructive">
          {blocked}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-border/80 px-3 py-[7px] text-[11px]">
        <span className="min-w-0 flex-[0_1_auto] overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-muted-foreground">
          {modelLabel ?? "No model chosen"}
        </span>
        <button
          type="button"
          className="-mx-0.5 -my-[3px] rounded-lg bg-foreground/7 px-2 py-[3px] text-[11px] text-foreground/85 transition-colors duration-[110ms] hover:bg-foreground/12 hover:text-foreground focus-visible:bg-foreground/16 focus-visible:text-foreground"
          onClick={onChangeModel}
        >
          Change model
        </button>
        <span className="ml-auto flex gap-2.5">
          <button
            type="button"
            className="-mx-0.5 -my-[3px] rounded-lg bg-foreground/7 px-2 py-[3px] text-[11px] text-foreground/85 transition-colors duration-[110ms] hover:bg-foreground/12 hover:text-foreground focus-visible:bg-foreground/16 focus-visible:text-foreground"
            onClick={onOpenPrompts}
          >
            Prompts
          </button>
          <button
            type="button"
            className="-mx-0.5 -my-[3px] rounded-lg bg-foreground/7 px-2 py-[3px] text-[11px] text-foreground/85 transition-colors duration-[110ms] hover:bg-foreground/12 hover:text-foreground focus-visible:bg-foreground/16 focus-visible:text-foreground inline-flex items-center gap-1"
            onClick={onOpenSettings}
          >
            <SettingsIcon size={12} aria-hidden="true" />
            AI settings
          </button>
        </span>
      </div>
      <div className="flex gap-3 border-t border-border/80 px-3 py-[7px] text-[11px] text-muted-foreground">
        <span>↑↓ navigate</span>
        <span>↵ run</span>
        <span className="ml-auto">esc close</span>
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
    <div className="flex flex-col">
      <div className="flex items-center gap-[9px] border-b border-border/80 px-3 py-[9px]">
        {canGoBack && (
          <button
            type="button"
            className="-mx-1 -my-0.5 cursor-pointer rounded-[3px] px-1 py-0.5 text-[11px] text-theme-secondary hover:text-foreground focus-visible:bg-foreground/14 focus-visible:text-foreground"
            onClick={onBack}
          >
            ← All actions
          </button>
        )}
        <span className="text-[13px] font-[560] text-foreground">{action.label}</span>
      </div>
      <label className="flex flex-col gap-[5px] px-3 pt-[11px] pb-[9px]">
        <span className="text-[11px] font-[560] text-theme-secondary">
          {shape?.label ?? "Instruction"}
        </span>
        <input
          autoFocus
          className="w-full bg-transparent text-[13.5px] text-foreground outline-none placeholder:text-muted-foreground rounded-lg border border-border bg-background px-[9px] py-1.5 transition-[border-color] duration-[140ms] focus:border-ring"
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
        <p role="alert" className="px-3 pb-2 text-[11.5px] text-destructive">
          {error}
        </p>
      )}
      <button
        type="button"
        className="mx-2 mt-[-2px] mb-1.5 cursor-pointer self-start rounded-[3px] px-1 py-0.5 text-[11px] text-theme-secondary underline underline-offset-2 hover:text-foreground focus-visible:bg-foreground/14 focus-visible:text-foreground"
        aria-expanded={showPayload}
        onClick={() => setShowPayload((open) => !open)}
      >
        {showPayload ? "Hide" : "Show"} exactly what is sent
      </button>
      {showPayload && (
        <pre
          className="mx-3 mb-[9px] max-h-[150px] overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-background px-2.5 py-2 font-mono text-[11.5px] leading-[1.55] text-foreground/85 [overflow-wrap:anywhere]"
          aria-label="Request preview"
        >
          {aiActionUserPrompt(action, input, instruction)}
        </pre>
      )}
      <div className="flex items-center gap-[9px] border-t border-border/80 px-3 py-[9px]">
        <button
          type="button"
          className="h-[26px] cursor-pointer rounded-lg bg-primary px-3 text-xs font-[560] text-primary-foreground transition-opacity duration-[120ms] focus-visible:bg-[linear-gradient(hsl(var(--primary-foreground)/0.18),hsl(var(--primary-foreground)/0.18))] disabled:cursor-default disabled:opacity-50"
          disabled={instructionError !== null}
          onClick={() => onRun(instruction)}
        >
          Run
        </button>
        <span className="min-w-0 flex-auto overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-muted-foreground">
          {modelLabel === null
            ? "No model chosen"
            : remote
              ? `${modelLabel} · leaves your device`
              : `${modelLabel} · on your device`}
        </span>
        <button
          type="button"
          className="-mx-0.5 -my-[3px] rounded-lg bg-foreground/7 px-2 py-[3px] text-[11px] text-foreground/85 transition-colors duration-[110ms] hover:bg-foreground/12 hover:text-foreground focus-visible:bg-foreground/16 focus-visible:text-foreground"
          onClick={onChangeModel}
        >
          Change
        </button>
      </div>
    </div>
  );
}
