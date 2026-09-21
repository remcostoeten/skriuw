import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FocusEvent, KeyboardEvent, ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

type Props = {
  renderTrigger: (api: { toggle: () => void; open: boolean }) => ReactNode;
  children: (api: { close: () => void }) => ReactNode;
  align?: "start" | "end";
  className?: string;
};

const MENU_ITEM_SELECTOR = '[role^="menuitem"]:not([aria-disabled="true"]):not(:disabled)';
const FOCUSABLE_SELECTOR =
  'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';
const VIEWPORT_MARGIN = 8;

function initialFocusTarget(panel: HTMLElement): HTMLElement | null {
  return (
    panel.querySelector<HTMLElement>('[role^="menuitem"][aria-checked="true"]') ??
    panel.querySelector<HTMLElement>(MENU_ITEM_SELECTOR) ??
    panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
  );
}

/**
 * Anchored popover for the properties surface. Moves focus inside on open,
 * closes when focus or a pointer leaves, and flips above the trigger when the
 * viewport has no room below. Rows marked `role="menuitem"` (or
 * `menuitemradio`) get arrow-key traversal; `shift+arrow` jumps to either end
 * for keyboards without Home/End.
 *
 * Focus handoff: Escape and the `close` handed to children both return focus
 * to the trigger, so activating an item with Enter/Space never strands focus
 * on `<body>` when the item unmounts. Tab and Shift+Tab close in one press and
 * continue in DOM order from the trigger; a focused menu item is moved to the
 * trigger first because items are `tabIndex={-1}` and Shift+Tab would
 * otherwise stop on the trigger with the panel still open. Other panel
 * controls (text inputs, confirm buttons) keep native Tab order and close via
 * blur once focus leaves the root.
 */
export function PropertyPopover({ renderTrigger, children, align = "start", className }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<"bottom" | "top">("bottom");

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const root = rootRef.current;
    if (!open || !panel || !root) return;
    const anchor = root.getBoundingClientRect();
    const spaceBelow = window.innerHeight - anchor.bottom - VIEWPORT_MARGIN;
    const spaceAbove = anchor.top - VIEWPORT_MARGIN;
    setSide(panel.offsetHeight > spaceBelow && spaceAbove > spaceBelow ? "top" : "bottom");
    if (!panel.contains(document.activeElement)) {
      initialFocusTarget(panel)?.focus({ preventScroll: true });
    }
  }, [open]);

  function closeAndRestoreFocus(): void {
    setOpen(false);
    rootRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
  }

  function moveMenuFocus(event: KeyboardEvent<HTMLDivElement>): void {
    const items = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR) ?? [],
    );
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    const last = items.length - 1;
    let next: number;
    if (event.key === "Home" || (event.key === "ArrowUp" && event.shiftKey)) next = 0;
    else if (event.key === "End" || (event.key === "ArrowDown" && event.shiftKey)) next = last;
    else if (event.key === "ArrowDown") next = current === -1 || current === last ? 0 : current + 1;
    else next = current <= 0 ? last : current - 1;
    event.preventDefault();
    items[next]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (!open) return;
    if (event.key === "Escape") {
      event.stopPropagation();
      closeAndRestoreFocus();
      return;
    }
    const target = event.target as HTMLElement;
    if (event.key === "Tab") {
      if (target.matches('[role^="menuitem"]')) {
        rootRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
      }
      setOpen(false);
      return;
    }
    const inTextField = target.matches("input, textarea");
    const vertical = event.key === "ArrowDown" || event.key === "ArrowUp";
    const edge = event.key === "Home" || event.key === "End";
    if (vertical || (edge && !inTextField)) {
      if (panelRef.current?.contains(target) || event.key === "ArrowDown") moveMenuFocus(event);
    }
  }

  function onBlur(event: FocusEvent<HTMLDivElement>): void {
    const next = event.relatedTarget as Node | null;
    if (open && next && !rootRef.current?.contains(next)) setOpen(false);
  }

  return (
    <div
      ref={rootRef}
      className={cn("relative", className)}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
    >
      {renderTrigger({ toggle: () => setOpen((current) => !current), open })}
      {open && (
        <div
          ref={panelRef}
          className={cn(
            "absolute z-50 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl",
            "animate-in fade-in-0 zoom-in-95 duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]",
            "motion-reduce:animate-none",
            side === "bottom"
              ? "top-[calc(100%+6px)] slide-in-from-top-1"
              : "bottom-[calc(100%+6px)] slide-in-from-bottom-1",
            align === "end" ? "right-0" : "left-0",
            side === "bottom"
              ? align === "end"
                ? "origin-top-right"
                : "origin-top-left"
              : align === "end"
                ? "origin-bottom-right"
                : "origin-bottom-left",
          )}
        >
          {children({ close: closeAndRestoreFocus })}
        </div>
      )}
    </div>
  );
}
