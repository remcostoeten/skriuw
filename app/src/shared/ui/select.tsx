import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { CheckIcon, ChevronDownIcon } from "@/shared/icons/static";
import { cn } from "@/shared/lib/utils";

export type SelectOption<TValue extends string> = {
  value: TValue;
  label: string;
  /** Secondary line rendered under the label. */
  detail?: string | null;
  /** Consecutive options sharing a group render under one sticky header. */
  group?: string;
};

type Props<TValue extends string> = {
  value: TValue | "";
  options: readonly SelectOption<TValue>[];
  onChange: (value: TValue) => void;
  label: string;
  prefix?: string;
  /** Shown on the trigger while `value` matches no option. */
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Extra class on the trigger button, e.g. to render as a full-width form field. */
  triggerClassName?: string;
  align?: "start" | "end";
};

const TYPEAHEAD_RESET_MS = 700;

/**
 * Compact listbox select rendered with app chrome instead of the native
 * OS dropdown. Supports arrow/Home/End navigation, type-ahead, Enter/Space to
 * commit, Escape to dismiss, and click-outside to close. Options carrying a
 * `group` are rendered under a header without leaving the flat keyboard model.
 */
export function Select<TValue extends string>({
  value,
  options,
  onChange,
  label,
  prefix,
  placeholder = "Select…",
  disabled = false,
  className,
  triggerClassName,
  align = "end",
}: Props<TValue>) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeahead = useRef({ query: "", at: 0 });
  const [open, setOpen] = useState(false);
  const matchedIndex = options.findIndex((option) => option.value === value);
  const selectedIndex = Math.max(0, matchedIndex);
  const [activeIndex, setActiveIndex] = useState(selectedIndex);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  function openAt(index: number): void {
    setActiveIndex(index);
    setOpen(true);
  }

  function commit(index: number): void {
    const option = options[index];
    if (option) {
      onChange(option.value);
    }
    setOpen(false);
    triggerRef.current?.focus();
  }

  function moveTo(index: number): void {
    if (options.length === 0) {
      return;
    }
    const next = (index + options.length) % options.length;
    if (open) {
      setActiveIndex(next);
    } else {
      commit(next);
    }
  }

  function runTypeahead(key: string): boolean {
    if (key.length !== 1 || key === " " || options.length === 0) {
      return false;
    }
    const now = Date.now();
    const query =
      now - typeahead.current.at > TYPEAHEAD_RESET_MS
        ? key.toLowerCase()
        : typeahead.current.query + key.toLowerCase();
    typeahead.current = { query, at: now };
    const from = open ? activeIndex : selectedIndex;
    for (let step = 1; step <= options.length; step += 1) {
      const index = (from + step) % options.length;
      if (options[index]?.label.toLowerCase().startsWith(query)) {
        if (open) {
          setActiveIndex(index);
        } else {
          openAt(index);
        }
        return true;
      }
    }
    return false;
  }

  function onKeyDown(event: ReactKeyboardEvent): void {
    if (disabled) {
      return;
    }
    if (event.key === "Escape") {
      if (open) {
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
      return;
    }
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (open) {
        moveTo(activeIndex + 1);
      } else if (event.altKey) {
        openAt(selectedIndex);
      } else {
        moveTo(selectedIndex + 1);
      }
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (open) {
        moveTo(activeIndex - 1);
      } else if (event.altKey) {
        openAt(selectedIndex);
      } else {
        moveTo(selectedIndex - 1);
      }
      return;
    }
    if (!open) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openAt(selectedIndex);
        return;
      }
      if (runTypeahead(event.key)) {
        event.preventDefault();
      }
      return;
    }
    if (event.key === "Home" || event.key === "PageUp") {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === "End" || event.key === "PageDown") {
      event.preventDefault();
      setActiveIndex(options.length - 1);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      commit(activeIndex);
      return;
    }
    if (runTypeahead(event.key)) {
      event.preventDefault();
    }
  }

  const selected = matchedIndex === -1 ? null : options[matchedIndex];

  return (
    <div ref={rootRef} className={cn("relative shrink-0", className)} onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${activeIndex}` : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openAt(selectedIndex))}
        className={cn(
          "inline-flex min-h-[30px] cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-muted/55 pl-2.5 pr-2 text-xs text-foreground/[0.86] transition-colors",
          "hover:bg-muted hover:text-foreground",
          "focus-visible:border-ring focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_hsl(var(--ring)/0.18)]",
          "data-[open=true]:border-ring data-[open=true]:bg-muted data-[open=true]:text-foreground",
          "disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:bg-muted/55",
          triggerClassName,
        )}
        data-open={open}
      >
        {prefix && <span className="text-theme-dim">{prefix}</span>}
        <span className={cn("truncate", selected === null && "text-muted-foreground")}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDownIcon
          size={13}
          aria-hidden="true"
          className={cn(
            "ml-auto shrink-0 text-theme-dim transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={label}
          tabIndex={-1}
          className={cn(
            "absolute top-[calc(100%+6px)] z-50 max-h-72 min-w-full overflow-y-auto overscroll-contain rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl",
            "animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]",
            "motion-reduce:animate-none",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {options.map((option, index) => (
            <SelectRow
              key={`${option.group ?? ""}:${option.value}`}
              id={`${listId}-${index}`}
              index={index}
              option={option}
              previousGroup={options[index - 1]?.group}
              active={index === activeIndex}
              selected={option.value === value}
              onActivate={() => setActiveIndex(index)}
              onCommit={() => commit(index)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

type RowProps<TValue extends string> = {
  id: string;
  index: number;
  option: SelectOption<TValue>;
  previousGroup: string | undefined;
  active: boolean;
  selected: boolean;
  onActivate: () => void;
  onCommit: () => void;
};

function SelectRow<TValue extends string>({
  id,
  index,
  option,
  previousGroup,
  active,
  selected,
  onActivate,
  onCommit,
}: RowProps<TValue>) {
  const showHeader = option.group !== undefined && option.group !== previousGroup;

  return (
    <>
      {showHeader && (
        <li
          role="presentation"
          className={cn(
            "sticky top-0 z-10 bg-popover px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70",
            index > 0 && "mt-1 border-t border-border/60",
          )}
        >
          {option.group}
        </li>
      )}
      <li
        id={id}
        role="option"
        aria-selected={selected}
        data-index={index}
        data-active={active}
        className={cn(
          "flex cursor-pointer select-none items-center gap-2 rounded-md py-1.5 pl-2 pr-3 text-xs text-muted-foreground transition-colors",
          "data-[active=true]:bg-accent data-[active=true]:text-foreground",
        )}
        onPointerEnter={onActivate}
        onClick={onCommit}
      >
        <span className="flex size-3.5 shrink-0 items-center justify-center">
          {selected && <CheckIcon size={13} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate">{option.label}</span>
          {option.detail && (
            <span className="block truncate text-[11px] text-muted-foreground/70">
              {option.detail}
            </span>
          )}
        </span>
      </li>
    </>
  );
}
