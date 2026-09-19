import { appRouteHash, type AppRoute } from "../../../shared/renderer-core/src/route/app-route";

export type ShellIconName =
  | "notes"
  | "journal"
  | "tasks"
  | "tags"
  | "people"
  | "trash"
  | "account"
  | "menu"
  | "close"
  | "plus"
  | "folder"
  | "chevron"
  | "pin";

export type ShellDestination = {
  route: ShellRoute;
  label: string;
  icon: ShellIconName;
  /** Expo Router path for the destination; tabs replace this entry rather than push onto it. */
  path: string;
};

/**
 * The destinations the compact shell reaches. The subset of `AppRoute` the
 * mobile client ships in 1.0: history, split panes and the prompt playground
 * are desktop-only (`docs/specs/mobile-app.md`, Scope).
 */
export type ShellRoute = Extract<
  AppRoute,
  "notes" | "journal" | "tasks" | "tags" | "people" | "trash"
>;

/**
 * Rail destinations, in rail order. The desktop rail (`app/src/commands/rail-items.ts`)
 * is the same list in the same order; both are named by `AppRoute`, which is
 * the shared model, so a destination cannot exist on one interface alone.
 */
export const SHELL_DESTINATIONS: readonly ShellDestination[] = [
  { route: "notes", label: "Notes", icon: "notes", path: "/" },
  { route: "journal", label: "Journal", icon: "journal", path: "/journal" },
  { route: "tasks", label: "Tasks", icon: "tasks", path: "/tasks" },
  { route: "tags", label: "Tags", icon: "tags", path: "/tags" },
  { route: "people", label: "People", icon: "people", path: "/people" },
  { route: "trash", label: "Trash", icon: "trash", path: "/trash" },
];

export function destinationForRoute(route: ShellRoute): ShellDestination {
  const found = SHELL_DESTINATIONS.find((destination) => destination.route === route);
  if (!found) {
    throw new Error(`no shell destination for route ${route}`);
  }
  return found;
}

/** The hash the same destination carries in the browser build, for parity assertions. */
export function destinationHash(route: ShellRoute): string {
  return appRouteHash(route);
}

/** The destination a router path is showing; anything unrecognised is the notes column. */
export function routeForPath(path: string): ShellRoute {
  const normalized = path.replace(/\/+$/, "");
  const match = SHELL_DESTINATIONS.find(
    (destination) => destination.path === (normalized === "" ? "/" : normalized),
  );
  return match?.route ?? "notes";
}
