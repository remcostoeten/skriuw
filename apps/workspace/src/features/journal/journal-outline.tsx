import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { KeyboardEvent } from "react";
import { cn } from "@/shared/styling/class-names";
import type { LedgerGroupEntry } from "@/shared/ui/settings-ledger";
import { FileTextIcon, BarChartIcon } from "@/shared/icons/static";
import {
  JOURNAL_SCROLLER_SELECTOR,
  JOURNAL_VIEWS,
  journalLedger,
  journalViewOf,
  type JournalView,
} from "./ledger";
import { journalTransition } from "./ledger-group";

const SPY_OFFSET = 90;
const PIN_MS = 700;
const OUTLINE_EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";

const VIEW_ICONS: Record<JournalView, typeof FileTextIcon> = {
  day: FileTextIcon,
  history: BarChartIcon,
};

function scrollerOf(groups: readonly LedgerGroupEntry[]): HTMLElement | null {
  return groups[0]?.element.closest<HTMLElement>(JOURNAL_SCROLLER_SELECTOR) ?? null;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The sidebar outline of the journal page. Two views, the open day and the
 * history, each expand into the groups on screen; scroll-spy keeps the view
 * that holds the visible group open and folds the other.
 */
export function JournalOutline() {
  const groups = useSyncExternalStore(
    journalLedger.subscribe,
    journalLedger.snapshot,
    journalLedger.snapshot,
  );
  const [current, setCurrent] = useState<string | null>(null);
  const pinRef = useRef<{ id: string; until: number } | null>(null);

  useEffect(() => {
    const scroller = scrollerOf(groups);
    if (scroller === null) {
      return;
    }
    const element = scroller;
    function update(): void {
      const pin = pinRef.current;
      if (pin !== null) {
        const target = groups.find((group) => group.id === pin.id);
        const targetTop = target
          ? target.element.getBoundingClientRect().top -
            element.getBoundingClientRect().top +
            element.scrollTop
          : 0;
        const unreachable = targetTop > element.scrollHeight - element.clientHeight + 2;
        if (performance.now() < pin.until || unreachable) {
          return;
        }
        pinRef.current = null;
      }
      const top = element.getBoundingClientRect().top + SPY_OFFSET;
      let next = groups[0]?.id ?? null;
      for (const group of groups) {
        if (group.element.getBoundingClientRect().top <= top) {
          next = group.id;
        }
      }
      setCurrent(next);
    }
    function release(): void {
      pinRef.current = null;
    }
    update();
    element.addEventListener("scroll", update, { passive: true });
    element.addEventListener("wheel", release, { passive: true });
    element.addEventListener("touchmove", release, { passive: true });
    element.addEventListener("keydown", release);
    return () => {
      element.removeEventListener("scroll", update);
      element.removeEventListener("wheel", release);
      element.removeEventListener("touchmove", release);
      element.removeEventListener("keydown", release);
    };
  }, [groups]);

  const active = groups.some((group) => group.id === current) ? current : (groups[0]?.id ?? null);
  const activeView = active === null ? "day" : journalViewOf(active);

  function jump(group: LedgerGroupEntry): void {
    const scroller = scrollerOf(groups);
    if (scroller === null) {
      return;
    }
    pinRef.current = { id: group.id, until: performance.now() + PIN_MS };
    setCurrent(group.id);
    const top =
      group.element.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top +
      scroller.scrollTop;
    scroller.scrollTo({
      top: group.id === "entry" ? 0 : Math.max(0, top - 8),
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }
    const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button")].filter(
      (button) => button.closest("[inert]") === null,
    );
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) {
      return;
    }
    event.preventDefault();
    const step = event.key === "ArrowDown" ? 1 : -1;
    items[Math.min(items.length - 1, Math.max(0, index + step))]?.focus();
  }

  return (
    <div
      role="group"
      aria-label="On this page"
      onKeyDown={handleKeyDown}
      className="flex flex-col gap-px"
    >
      {JOURNAL_VIEWS.map((view) => {
        const open = view.id === activeView;
        const viewGroups = groups.filter((group) => journalViewOf(group.id) === view.id);
        const Icon = VIEW_ICONS[view.id];
        const outlineId = `journal-outline-${view.id}`;
        return (
          <div key={view.id}>
            <button
              type="button"
              aria-expanded={open}
              aria-controls={outlineId}
              onClick={() => {
                const first = viewGroups[0];
                if (first !== undefined) {
                  jump(first);
                }
              }}
              className={cn(
                "flex min-h-8 w-full cursor-pointer items-center gap-[9px] rounded-[7px] px-[9px] py-[5px] text-left text-[12.5px] hover:bg-theme-hover/55 hover:text-foreground active:scale-[0.97] motion-reduce:active:scale-100",
                open ? "bg-theme-hover text-foreground" : "text-theme-secondary",
                journalTransition,
              )}
            >
              <Icon size={15} className="shrink-0 opacity-85" aria-hidden="true" />
              <span className="flex-1">{view.label}</span>
            </button>
            <div
              id={outlineId}
              data-open={open}
              inert={!open}
              className={cn(
                "-mt-px grid grid-rows-[0fr] transition-[grid-template-rows] duration-200 data-[open=true]:grid-rows-[1fr] motion-reduce:transition-none",
                OUTLINE_EASE,
              )}
            >
              <div className="min-h-0 overflow-hidden">
                <div
                  data-open={open}
                  className={cn(
                    "mt-0.5 mb-1.5 ml-5 flex -translate-y-1 flex-col gap-px border-l border-theme-divider pl-2.5 opacity-0 transition-[opacity,transform] duration-100 data-[open=true]:translate-y-0 data-[open=true]:opacity-100 data-[open=true]:delay-[40ms] data-[open=true]:duration-200 motion-reduce:translate-y-0",
                    OUTLINE_EASE,
                  )}
                >
                  {viewGroups.map((group) => (
                    <button
                      key={group.id}
                      type="button"
                      aria-current={group.id === active ? "true" : undefined}
                      onClick={() => jump(group)}
                      className={cn(
                        "relative block w-full cursor-pointer truncate rounded-[5px] border-0 bg-transparent px-[7px] py-1 text-left text-xs text-theme-dim hover:bg-theme-hover/55 hover:text-foreground aria-[current=true]:text-foreground",
                        "aria-[current=true]:bg-theme-hover/70 aria-[current=true]:font-medium",
                        journalTransition,
                      )}
                    >
                      {group.title}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
