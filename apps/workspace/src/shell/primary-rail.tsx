import { useCallback, useEffect, useState } from "react";
import type { ComponentProps, ReactNode } from "react";
import type { AppRoute } from "@skriuw/renderer-core/route/app-route";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import type { RendererState, RendererStore } from "@skriuw/renderer-core/store/types";
import { Tooltip } from "@skriuw/shared/ui/tooltip";
import { useShortcutHints } from "@/commands/hints";
import { RAIL_ITEMS, type RailItem } from "@/commands/rail-items";
import { useToday } from "@/shared/format/use-today";
import { AppIcon } from "@/shared/icons/app-icon";
import { PanelLeftIcon, SkriuwLogo } from "@/shared/icons/static";
import { cn } from "@/shared/styling/class-names";
import { RAIL_ICONS, railActiveClass, railInactiveClass, railItemClass } from "./rail";
import { dueTaskCount, journalTodayUnwritten } from "./rail-status";

const RAIL_SHORTCUT_IDS = [
  "goToNotes",
  "goToJournal",
  "goToTasks",
  "goToTags",
  "goToPeople",
  "goToTrash",
  "openSettings",
  "toggleRailLabels",
] as const;

type Props = {
  store: RendererStore;
  route: AppRoute;
  wide: boolean;
  hidden: boolean;
  settling: boolean;
  settingsOpen: boolean;
  onOpenSettings: () => void;
  onToggleLabels: () => void;
  accountMenu: ReactNode;
};

type RailMarker = { kind: "count"; count: number } | { kind: "dot"; label: string } | null;

function labelClass(wide: boolean): string {
  return cn(
    "shrink-0 transition-opacity duration-150",
    wide ? "opacity-100 delay-75" : "pointer-events-none opacity-0",
  );
}

type RailTooltipProps = {
  wide: boolean;
  label: string;
  shortcut: string | undefined;
  children: ComponentProps<typeof Tooltip>["children"];
};

function RailTooltip({ wide, label, shortcut, children }: RailTooltipProps) {
  if (wide) {
    return children;
  }
  return (
    <Tooltip label={label} side="right" shortcut={shortcut}>
      {children}
    </Tooltip>
  );
}

function useNumbersHeld(enabled: boolean): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!enabled) {
      setHeld(false);
      return;
    }
    function sync(event: KeyboardEvent): void {
      setHeld((event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey);
    }
    function release(): void {
      setHeld(false);
    }
    window.addEventListener("keydown", sync);
    window.addEventListener("keyup", sync);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("keydown", sync);
      window.removeEventListener("keyup", sync);
      window.removeEventListener("blur", release);
    };
  }, [enabled]);
  return held;
}

type RailNavItemProps = {
  item: RailItem;
  position: number;
  active: boolean;
  wide: boolean;
  shortcut: string | undefined;
  numbersHeld: boolean;
  marker: RailMarker;
};

function RailNavItem({
  item,
  position,
  active,
  wide,
  shortcut,
  numbersHeld,
  marker,
}: RailNavItemProps) {
  const showNumber = numbersHeld && shortcut?.endsWith(String(position)) === true;
  const markerLabel =
    marker?.kind === "count"
      ? `, ${marker.count} due`
      : marker?.kind === "dot"
        ? `, ${marker.label}`
        : "";
  return (
    <RailTooltip wide={wide} label={item.label} shortcut={shortcut}>
      <a
        href={`#/${item.route}`}
        className={cn(railItemClass, active ? railActiveClass : railInactiveClass)}
        aria-label={`${item.label}${markerLabel}`}
        aria-current={active ? "page" : undefined}
      >
        <AppIcon name={RAIL_ICONS[item.actionId]} size={18} className="shrink-0" />
        {marker?.kind === "count" && (
          <span
            className="absolute top-1 left-[22px] grid h-[15px] min-w-[15px] place-items-center rounded-full bg-accent-ink px-1 text-[9.5px] font-semibold tabular-nums text-accent-ink-foreground shadow-[0_0_0_2px_hsl(var(--sidebar-background))]"
            aria-hidden="true"
          >
            {marker.count > 99 ? "99+" : marker.count}
          </span>
        )}
        {marker?.kind === "dot" && (
          <span
            className="absolute top-[7px] left-[25px] h-1.5 w-1.5 rounded-full bg-theme-blue shadow-[0_0_0_2px_hsl(var(--sidebar-background))]"
            aria-hidden="true"
          />
        )}
        <span className={labelClass(wide)}>{item.label}</span>
        <span
          className={cn(
            "pointer-events-none grid place-items-center rounded border border-border bg-popover font-mono leading-none text-foreground transition-[opacity,transform] duration-150",
            wide
              ? "ml-auto h-4 min-w-4 text-[10px]"
              : "absolute right-0.5 bottom-0.5 h-3.5 min-w-3.5 text-[9.5px]",
            showNumber ? "scale-100 opacity-100" : "scale-75 opacity-0",
          )}
          aria-hidden="true"
        >
          {position}
        </span>
      </a>
    </RailTooltip>
  );
}

export function PrimaryRail({
  store,
  route,
  wide,
  hidden,
  settling,
  settingsOpen,
  onOpenSettings,
  onToggleLabels,
  accountMenu,
}: Props) {
  const hints = useShortcutHints(store, RAIL_SHORTCUT_IDS);
  const today = useToday();
  const selectDueCount = useCallback((state: RendererState) => dueTaskCount(state, today), [today]);
  const selectJournalUnwritten = useCallback(
    (state: RendererState) => journalTodayUnwritten(state, today),
    [today],
  );
  const dueCount = useRendererSelector(store, selectDueCount);
  const journalUnwritten = useRendererSelector(store, selectJournalUnwritten);
  const numbersHeld = useNumbersHeld(!hidden);

  function markerFor(item: RailItem): RailMarker {
    if (item.route === "tasks" && dueCount > 0) {
      return { kind: "count", count: dueCount };
    }
    if (item.route === "journal" && journalUnwritten) {
      return { kind: "dot", label: "today not written yet" };
    }
    return null;
  }

  function navItem(item: RailItem) {
    return (
      <RailNavItem
        key={item.actionId}
        item={item}
        position={RAIL_ITEMS.indexOf(item) + 1}
        active={route === item.route}
        wide={wide}
        shortcut={hints[item.actionId]}
        numbersHeld={numbersHeld}
        marker={markerFor(item)}
      />
    );
  }

  const labelsAction = wide ? "Hide labels" : "Show labels";

  return (
    <nav
      aria-label="Primary"
      className={cn(
        "relative z-[2] flex min-w-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar",
        hidden && "sidebar-pane-collapsed",
        settling && "sidebar-pane-settling",
      )}
      aria-hidden={hidden}
      inert={hidden}
    >
      <div className="flex h-11 shrink-0 items-center border-b border-sidebar-border px-2">
        <RailTooltip wide={wide} label="Skriuw" shortcut={undefined}>
          <a
            href="#/notes"
            className="flex h-9 min-w-0 items-center gap-2.5 rounded-lg px-[9px] text-sidebar-foreground/92 outline-none transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground focus-visible:shadow-[inset_0_0_0_1px_hsl(var(--foreground)/0.35)]"
            aria-label="Go to home"
          >
            <SkriuwLogo size={22} className="shrink-0" />
            <span
              className={cn(labelClass(wide), "text-[13.5px] font-semibold tracking-[-0.01em]")}
            >
              Skriuw
            </span>
          </a>
        </RailTooltip>
      </div>
      <div className="flex flex-col gap-0.5 p-2">
        {RAIL_ITEMS.filter((item) => item.section === "primary").map(navItem)}
      </div>
      <div className="mt-auto flex flex-col gap-0.5 p-2 pb-3">
        {RAIL_ITEMS.filter((item) => item.section === "utility").map(navItem)}
        <RailTooltip wide={wide} label="Settings" shortcut={hints.openSettings}>
          <button
            type="button"
            className={cn(railItemClass, settingsOpen ? railActiveClass : railInactiveClass)}
            aria-label="Settings"
            aria-haspopup="dialog"
            aria-expanded={settingsOpen}
            onClick={onOpenSettings}
          >
            <AppIcon name="settings" size={18} className="shrink-0" />
            <span className={labelClass(wide)}>Settings</span>
          </button>
        </RailTooltip>
        <RailTooltip wide={wide} label={labelsAction} shortcut={hints.toggleRailLabels}>
          <button
            type="button"
            className={cn(railItemClass, railInactiveClass)}
            aria-label={labelsAction}
            aria-pressed={wide}
            onClick={onToggleLabels}
          >
            <PanelLeftIcon size={18} className="shrink-0" />
            <span className={labelClass(wide)}>Hide labels</span>
          </button>
        </RailTooltip>
        {accountMenu}
      </div>
    </nav>
  );
}
