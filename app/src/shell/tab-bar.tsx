import type { ReactNode } from "react";
import type { AppRoute } from "@/app-route";
import { RAIL_ITEMS } from "@/commands/rail-items";
import { AppIcon } from "@/shared/icons/app-icon";
import { RAIL_ICONS } from "./rail-icons";

type Props = {
  route: AppRoute;
  /** The account trigger, rendered as the last tab so settings stay one tap away on every route. */
  account: ReactNode;
};

/**
 * Compact replacement for the navigation rail: a bottom tab bar with the same
 * destinations, sized for thumbs and padded for the home indicator.
 */
export function TabBar({ route, account }: Props) {
  return (
    <nav aria-label="Primary" className="shell-tab-bar">
      {RAIL_ITEMS.map((item) => {
        const active = route === item.route;
        return (
          <a
            key={item.actionId}
            href={`#/${item.route}`}
            className="shell-tab"
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            data-active={active ? "true" : undefined}
          >
            <AppIcon name={RAIL_ICONS[item.actionId]} size={20} />
            <span className="shell-tab-label">{item.label}</span>
          </a>
        );
      })}
      <div className="shell-tab shell-tab-account">{account}</div>
    </nav>
  );
}
