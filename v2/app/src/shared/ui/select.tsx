import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { CheckIcon, ChevronDownIcon } from "../icons";
import { cn } from "../lib/utils";

export type SelectOption<TValue extends string> = {
  value: TValue;
  label: string;
};

type Props<TValue extends string> = {
  value: TValue;
  options: readonly SelectOption<TValue>[];
  onChange: (value: TValue) => void;
  label: string;
  prefix?: string;
  className?: string;
  /** Extra class on the trigger button, e.g. to render as a full-width form field. */
  triggerClassName?: string;
  align?: "start" | "end";
};

/**
 * Compact listbox select rendered with app chrome instead of the native
 * OS dropdown. Supports arrow/Home/End navigation, Enter/Space to commit,
 * Escape to dismiss, and click-outside to close.
 */
export function Select<TValue extends string>({
  value,
  options,
  onChange,
  label,
  prefix,
  className,
  triggerClassName,
  align = "end",
}: Props<TValue>) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
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

  function onKeyDown(event: ReactKeyboardEvent): void {
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
    if (!open) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter") {
        event.preventDefault();
        openAt(selectedIndex);
      }
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % options.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current - 1 + options.length) % options.length);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(options.length - 1);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      commit(activeIndex);
    }
  }

  const selected = options[selectedIndex];

  return (
    <div ref={rootRef} className={cn("relative shrink-0", className)} onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? setOpen(false) : openAt(selectedIndex))}
        className={cn(
          "inline-flex min-h-[30px] cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-muted/55 pl-2.5 pr-2 text-xs text-foreground/[0.86] transition-colors",
          "hover:bg-muted hover:text-foreground",
          "focus-visible:border-ring focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_hsl(var(--ring)/0.18)]",
          "data-[open=true]:border-ring data-[open=true]:bg-muted data-[open=true]:text-foreground",
          triggerClassName,
        )}
        data-open={open}
      >
        {prefix && <span className="text-theme-dim">{prefix}</span>}
        <span className="truncate">{selected?.label}</span>
        <ChevronDownIcon
          size={13}
          aria-hidden="true"
          className={cn(
            "text-theme-dim transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          tabIndex={-1}
          className={cn(
            "absolute top-[calc(100%+6px)] z-50 min-w-full overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl",
            "animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]",
            "motion-reduce:animate-none",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              data-active={index === activeIndex}
              className={cn(
                "flex cursor-pointer select-none items-center gap-2 whitespace-nowrap rounded-md py-1.5 pl-2 pr-3 text-xs text-muted-foreground transition-colors",
                "data-[active=true]:bg-accent data-[active=true]:text-foreground",
              )}
              onPointerEnter={() => setActiveIndex(index)}
              onClick={() => commit(index)}
            >
              <span className="flex size-3.5 shrink-0 items-center justify-center">
                {option.value === value && <CheckIcon size={13} />}
              </span>
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
