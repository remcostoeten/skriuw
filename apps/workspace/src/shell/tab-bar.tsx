import type { MouseEvent, ReactNode } from "react";
import { replaceRouteHash } from "@/app-route";
import { type AppRoute } from "@skriuw/renderer-core/route/app-route";
import { RAIL_ITEMS } from "@/commands/rail-items";
import { AppIcon } from "@/shared/icons/app-icon";
import { RAIL_ICONS } from "./rail-icons";

type Props = {
  route: AppRoute;
  /** The account trigger, rendered as the last tab so settings stay one tap away on every route. */
  account: ReactNode;
};

function onTabClick(event: MouseEvent<HTMLAnchorElement>, hash: string): void {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }
  event.preventDefault();
  replaceRouteHash(hash);
}

/**
 * Compact replacement for the navigation rail: a bottom tab bar with the same
 * destinations, sized for thumbs and padded for the home indicator. A tab
 * replaces the current history entry instead of pushing one, so the back
 * gesture leaves the app instead of walking through every tab visited.
 */
export function TabBar({ route, account }: Props) {
  return (
    <nav
      aria-label="Primary"
      className="shell-tab-bar flex min-h-14 items-stretch border-t border-sidebar-border bg-sidebar pb-(--safe-bottom) text-sidebar-foreground keyboard-open:hidden"
    >
      {RAIL_ITEMS.map((item) => {
        const active = route === item.route;
        const hash = `#/${item.route}`;
        return (
          <a
            key={item.actionId}
            href={hash}
            onClick={(event) => onTabClick(event, hash)}
            className="shell-tab flex min-h-14 min-w-0 flex-1 basis-0 flex-col items-center justify-center gap-[3px] text-sidebar-foreground/55 no-underline [-webkit-touch-callout:none] active:text-sidebar-foreground data-[active=true]:text-sidebar-foreground"
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            data-active={active ? "true" : undefined}
          >
            <AppIcon name={RAIL_ICONS[item.actionId]} size={20} />
            <span className="max-w-full truncate text-[10px] leading-none font-medium">
              {item.label}
            </span>
          </a>
        );
      })}
      <div className="shell-tab flex min-h-14 min-w-0 flex-1 basis-0 flex-col items-center justify-center gap-[3px] text-sidebar-foreground/55 no-underline [-webkit-touch-callout:none] active:text-sidebar-foreground data-[active=true]:text-sidebar-foreground *:flex *:size-full *:items-center *:justify-center">
        {account}
      </div>
    </nav>
  );
}
