import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { formatLongDate, type DateKey } from "@skriuw/renderer-core/journal/dates";
import {
  dueQuickPicks,
  formatDueLabel,
  resolveDueExpression,
} from "@skriuw/renderer-core/tasks/due-dates";
import { cn } from "@/shared/styling/class-names";

const WIDTH = 252;
const HEIGHT = 286;
const GAP = 6;
const EDGE = 12;

type Props = {
  anchor: HTMLElement;
  title: string;
  current: DateKey | null;
  today: DateKey;
  onCommit: (dueDate: DateKey | null) => void;
  onClose: (returnFocus: boolean) => void;
};

type Placement = {
  top: number;
  left: number;
  origin: string;
};

function place(anchor: HTMLElement): Placement {
  const rect = anchor.getBoundingClientRect();
  const below = rect.bottom + GAP + HEIGHT <= window.innerHeight - EDGE;
  const top = below ? rect.bottom + GAP : Math.max(EDGE, rect.top - GAP - HEIGHT);
  const left = Math.min(window.innerWidth - WIDTH - EDGE, Math.max(EDGE, rect.right - WIDTH));
  return { top, left, origin: below ? "top right" : "bottom right" };
}

const pickClass =
  "flex w-full cursor-pointer justify-between gap-2.5 rounded-md border-0 bg-transparent px-2 py-1.5 text-left text-[12.5px] text-popover-foreground outline-none transition-colors duration-[120ms] hover:bg-theme-hover focus-visible:bg-theme-hover";

export function DueDatePopover({ anchor, title, current, today, onCommit, onClose }: Props) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState(() => place(anchor));
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const picks = dueQuickPicks(today);
  const typed = text.trim();
  const parsed = typed.length === 0 ? null : resolveDueExpression(typed, today);

  useLayoutEffect(() => {
    setPlacement(place(anchor));
    inputRef.current?.focus();
    const frame = window.requestAnimationFrame(() => setOpen(true));
    return () => window.cancelAnimationFrame(frame);
  }, [anchor]);

  useEffect(() => {
    function follow(): void {
      setPlacement(place(anchor));
    }
    const observer = new ResizeObserver(follow);
    const scope = anchor.closest("[data-task-row], [data-task-sheet]");
    if (scope) observer.observe(scope);
    window.addEventListener("resize", follow);
    document.addEventListener("scroll", follow, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", follow);
      document.removeEventListener("scroll", follow, true);
    };
  }, [anchor]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent): void {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target) || anchor.contains(target)) return;
      onClose(false);
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [anchor, onClose]);

  function buttons(): HTMLButtonElement[] {
    return Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>("[data-pick]") ?? []);
  }

  function onInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter") {
      event.preventDefault();
      if (typed.length === 0) {
        onClose(true);
      } else if (parsed !== null) {
        onCommit(parsed);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose(true);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      buttons()[0]?.focus();
    } else if (event.key === "Delete" && typed.length === 0 && current !== null) {
      event.preventDefault();
      onCommit(null);
    }
  }

  function onPicksKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    const list = buttons();
    const index = list.findIndex((button) => button === document.activeElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      list[Math.min(list.length - 1, index + 1)]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (index <= 0) inputRef.current?.focus();
      else list[index - 1]?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose(true);
    } else if (event.key === "Delete" && current !== null) {
      event.preventDefault();
      onCommit(null);
    }
  }

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label={`Due date for ${title}`}
      data-open={open}
      className="task-popover fixed z-40 w-[252px] rounded-[10px] border border-border bg-popover p-1.5 text-popover-foreground shadow-[0_16px_44px_-8px_hsl(var(--scrim)/0.45)]"
      style={{ top: placement.top, left: placement.left, transformOrigin: placement.origin }}
    >
      <input
        ref={inputRef}
        type="text"
        value={text}
        placeholder="Fri, next week, 20 Nov"
        autoComplete="off"
        spellCheck={false}
        aria-label="Due date"
        aria-describedby="task-due-preview"
        className="h-[30px] w-full rounded-[7px] border border-border bg-background px-[9px] text-[12.5px] text-foreground outline-none transition-[border-color] duration-150 placeholder:text-theme-dim focus-visible:border-ring"
        onChange={(event) => setText(event.currentTarget.value)}
        onKeyDown={onInputKeyDown}
      />
      <div
        id="task-due-preview"
        aria-live="polite"
        className={cn(
          "min-h-[26px] px-1 pt-1.5 pb-1 text-[11.5px] text-theme-dim",
          typed.length > 0 && parsed === null && "text-destructive",
        )}
      >
        {typed.length === 0 ? (
          current === null ? (
            "No date yet"
          ) : (
            <>
              Due <b className="font-medium text-foreground">{formatLongDate(current)}</b>
            </>
          )
        ) : parsed === null ? (
          "Not a date I can read"
        ) : (
          <>
            <b className="font-medium text-foreground">{formatLongDate(parsed)}</b> ·{" "}
            {formatDueLabel(parsed, today)}
          </>
        )}
      </div>
      <div
        className="flex flex-col gap-px border-t border-theme-divider/85 pt-1"
        onKeyDown={onPicksKeyDown}
      >
        {picks.map((pick) => (
          <button
            key={pick.label}
            type="button"
            data-pick=""
            className={pickClass}
            onClick={() => onCommit(pick.dueDate)}
          >
            {pick.label}
            <span className="tabular-nums text-theme-dim">
              {formatDueLabel(pick.dueDate, today)}
            </span>
          </button>
        ))}
        {current === null ? null : (
          <button
            type="button"
            data-pick=""
            className={cn(pickClass, "text-destructive")}
            onClick={() => onCommit(null)}
          >
            Clear date
            <span>
              <kbd>Del</kbd>
            </span>
          </button>
        )}
      </div>
      <div
        className="flex gap-2.5 px-1 pt-1.5 pb-0.5 text-[10.5px] text-theme-dim"
        aria-hidden="true"
      >
        <span>
          <kbd>Enter</kbd> Save
        </span>
        <span>
          <kbd>Esc</kbd> Cancel
        </span>
        <span>
          <kbd>↓</kbd> Picks
        </span>
      </div>
    </div>
  );
}
