import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { RefObject } from "react";
import { cn } from "@/shared/styling/class-names";
import { settingsTransition } from "@/shared/ui/settings-controls";
import type { LedgerGroupEntry, LedgerRegistry } from "@/shared/ui/settings-ledger";

const SPY_OFFSET = 28;
const PIN_MS = 700;

type Props = {
  open: boolean;
  registry: LedgerRegistry;
  scrollerRef: RefObject<HTMLDivElement | null>;
  onJump: (groupId: string) => void;
};

export function LedgerOutline({ open, registry, scrollerRef, onJump }: Props) {
  const live = useSyncExternalStore(registry.subscribe, registry.snapshot, registry.snapshot);
  const [held, setHeld] = useState<readonly LedgerGroupEntry[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const pinnedUntilRef = useRef(0);

  if (open && live.length > 0 && live !== held) {
    setHeld(live);
  }

  const groups = open ? live : held;

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!open || !scroller) return;
    const element = scroller;
    function update(): void {
      if (performance.now() < pinnedUntilRef.current) return;
      const top = element.getBoundingClientRect().top + SPY_OFFSET;
      let next = groups[0]?.id ?? null;
      for (const group of groups) {
        if (group.element.getBoundingClientRect().top <= top) next = group.id;
      }
      if (
        element.scrollTop > 0 &&
        element.scrollTop + element.clientHeight >= element.scrollHeight - 2
      ) {
        next = groups.at(-1)?.id ?? next;
      }
      setCurrent(next);
    }
    update();
    element.addEventListener("scroll", update, { passive: true });
    return () => element.removeEventListener("scroll", update);
  }, [open, groups, scrollerRef]);

  const active = groups.some((group) => group.id === current) ? current : (groups[0]?.id ?? null);

  return (
    <div
      role="presentation"
      data-open={open}
      inert={!open}
      className="-mt-px grid grid-rows-[0fr] transition-[grid-template-rows] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] data-[open=true]:grid-rows-[1fr] motion-reduce:transition-none max-[620px]:hidden"
      onTransitionEnd={(event) => {
        if (!open && event.target === event.currentTarget) setHeld([]);
      }}
    >
      <div className="min-h-0 overflow-hidden">
        <div
          data-open={open}
          className="mt-0.5 mb-1.5 ml-5 flex -translate-y-1 flex-col gap-px border-l border-theme-divider pl-2.5 opacity-0 transition-[opacity,transform] duration-100 ease-[cubic-bezier(0.23,1,0.32,1)] data-[open=true]:translate-y-0 data-[open=true]:opacity-100 data-[open=true]:delay-[40ms] data-[open=true]:duration-200 motion-reduce:translate-y-0"
        >
          {groups.map((group) => (
            <button
              key={group.id}
              type="button"
              tabIndex={-1}
              data-outline-item={group.id}
              aria-current={group.id === active ? "true" : undefined}
              className={cn(
                "relative block w-full cursor-pointer rounded-[5px] border-0 bg-transparent px-[7px] py-1 text-left text-xs text-theme-dim hover:bg-theme-hover/55 hover:text-foreground aria-[current=true]:text-foreground",
                "aria-[current=true]:bg-theme-hover/70 aria-[current=true]:font-medium",
                settingsTransition,
              )}
              onClick={() => {
                pinnedUntilRef.current = performance.now() + PIN_MS;
                setCurrent(group.id);
                onJump(group.id);
              }}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 flex-1 truncate">
                  {group.title}
                  {group.alert ? (
                    <span
                      aria-hidden="true"
                      className="ml-1.5 inline-block size-[5px] rounded-full bg-destructive align-[1px]"
                    />
                  ) : null}
                </span>
                {group.count === undefined ? null : (
                  <span className="text-[10.5px] tabular-nums text-theme-dim">{group.count}</span>
                )}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
