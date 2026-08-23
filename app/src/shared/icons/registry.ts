import { lazy } from "react";
import type { ComponentType, SVGProps } from "react";
import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FolderOpenIcon,
  ListTodoIcon,
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

type AnimatedIconModule = typeof import("./animated-components");
type AnimatedIconName = keyof AnimatedIconModule["ANIMATED_ICONS"];

let animatedIconModule: Promise<AnimatedIconModule> | undefined;

function loadAnimatedIconModule(): Promise<AnimatedIconModule> {
  return (animatedIconModule ??= import("./animated-components"));
}

function animated(name: AnimatedIconName): AnimatedIconComponent {
  const load = () => loadAnimatedIconModule().then((module) => ({
    default: module.ANIMATED_ICONS[name],
  }));
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
    animated: animated("notes"),
  },
  journal: {
    static: CalendarDaysIcon,
    animated: animated("journal"),
  },
  tasks: {
    static: ListTodoIcon,
  },
  tags: {
    static: TagsIcon,
    animated: animated("tags"),
  },
  people: {
    static: UsersIcon,
    animated: animated("people"),
  },
  trash: {
    static: Trash2Icon,
    animated: animated("trash"),
  },
  settings: {
    static: SettingsIcon,
    animated: animated("settings"),
  },
  "previous-note": {
    static: ChevronLeftIcon,
    animated: animated("previous-note"),
  },
  "next-note": {
    static: ChevronRightIcon,
    animated: animated("next-note"),
  },
  "version-history": {
    static: RotateCcwIcon,
    animated: animated("version-history"),
  },
  "toggle-sidebar": {
    static: PanelLeftToggleIcon,
    animated: animated("toggle-sidebar"),
  },
  "find-in-note": {
    static: SearchIcon,
  },
  "toggle-metadata": {
    static: PanelRightToggleIcon,
    animated: animated("toggle-metadata"),
  },
} as const satisfies Record<string, IconEntry>;

export type AppIconName = keyof typeof APP_ICONS;
