import { lazy } from "react";
import type { ComponentType, SVGProps } from "react";
import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FolderOpenIcon,
  PanelLeftToggleIcon,
  PanelRightToggleIcon,
  RotateCcwIcon,
  SearchIcon,
  SettingsIcon,
  TagsIcon,
  Trash2Icon,
  UsersIcon,
} from "./static";

export type StaticIconComponent = ComponentType<
  SVGProps<SVGSVGElement> & { size?: number }
>;

/**
 * Both icon sources are driven the same way: a boolean that is true while the
 * pointer is over the control. animate-ui takes it directly as `animate`;
 * animateicons is adapted to the same shape in `adapt-animateicons.tsx`.
 */
export type AnimatedIconComponent = ComponentType<{
  size?: number;
  animate?: boolean;
  className?: string;
}> & {
  /** Starts the chunk fetch so a later hover has nothing to wait on. */
  preload: () => Promise<unknown>;
};

type IconEntry = {
  /** Always rendered when animation is off, and as the Suspense fallback. */
  static: StaticIconComponent;
  /** Optional: an icon with no animated counterpart stays static everywhere. */
  animated?: AnimatedIconComponent;
};

function animated(
  load: () => Promise<{ default: unknown }>,
): AnimatedIconComponent {
  const component = lazy(
    load as () => Promise<{ default: AnimatedIconComponent }>,
  ) as unknown as AnimatedIconComponent;
  let started: Promise<unknown> | undefined;
  component.preload = () => (started ??= load());
  return component;
}

/**
 * The single place application icons are declared. Keys are named after the
 * action, not the glyph, so a better-fitting icon can be swapped in without
 * touching call sites. Adding an icon means adding one entry here.
 *
 * Most animated counterparts come from animate-ui. Its set has no folder,
 * calendar, or tag icon, so notes/journal/tags keep their animateicons
 * versions — see `adapt-animateicons.tsx` for how those are normalised onto
 * the same prop contract.
 */
export const APP_ICONS = {
  notes: {
    static: FolderOpenIcon,
    animated: animated(() =>
      import("./adapt-animateicons").then((module) => ({ default: module.FolderOpen })),
    ),
  },
  journal: {
    static: CalendarDaysIcon,
    animated: animated(() =>
      import("./adapt-animateicons").then((module) => ({ default: module.CalendarDays })),
    ),
  },
  tags: {
    static: TagsIcon,
    animated: animated(() =>
      import("./adapt-animateicons").then((module) => ({ default: module.Tags })),
    ),
  },
  people: {
    static: UsersIcon,
    animated: animated(() =>
      import("@/shared/icons/animate-ui/icons/users").then((module) => ({ default: module.Users })),
    ),
  },
  trash: {
    static: Trash2Icon,
    animated: animated(() =>
      import("@/shared/icons/animate-ui/icons/trash-2").then((module) => ({ default: module.Trash2 })),
    ),
  },
  settings: {
    static: SettingsIcon,
    animated: animated(() =>
      import("@/shared/icons/animate-ui/icons/settings").then((module) => ({ default: module.Settings })),
    ),
  },
  "previous-note": {
    static: ChevronLeftIcon,
    animated: animated(() =>
      import("@/shared/icons/animate-ui/icons/chevron-left").then((module) => ({ default: module.ChevronLeft })),
    ),
  },
  "next-note": {
    static: ChevronRightIcon,
    animated: animated(() =>
      import("@/shared/icons/animate-ui/icons/chevron-right").then((module) => ({ default: module.ChevronRight })),
    ),
  },
  "version-history": {
    static: RotateCcwIcon,
    animated: animated(() =>
      import("@/shared/icons/animate-ui/icons/rotate-ccw").then((module) => ({ default: module.RotateCcw })),
    ),
  },
  "toggle-sidebar": {
    static: PanelLeftToggleIcon,
    animated: animated(() =>
      import("@/shared/icons/animate-ui/icons/panel-left").then((module) => ({ default: module.PanelLeft })),
    ),
  },
  "find-in-note": {
    static: SearchIcon,
  },
  "toggle-metadata": {
    static: PanelRightToggleIcon,
    animated: animated(() =>
      import("@/shared/icons/animate-ui/icons/panel-right").then((module) => ({ default: module.PanelRight })),
    ),
  },
} as const satisfies Record<string, IconEntry>;

export type AppIconName = keyof typeof APP_ICONS;
