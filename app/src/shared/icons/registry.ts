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

type AnimatedSet = typeof import("./animated-set");

/**
 * Every animated counterpart lives behind this one dynamic import. Splitting
 * per icon produced a request per icon on the same idle tick, for chunks of
 * roughly a kilobyte each; the split that matters is animated-vs-not, and that
 * is the boundary this draws.
 */
let animatedSet: Promise<AnimatedSet> | undefined;

function loadAnimatedSet(): Promise<AnimatedSet> {
  return (animatedSet ??= import("./animated-set"));
}

function animated(
  pick: (set: AnimatedSet) => unknown,
): AnimatedIconComponent {
  const component = lazy(() =>
    loadAnimatedSet().then((set) => ({
      default: pick(set) as AnimatedIconComponent,
    })),
  ) as unknown as AnimatedIconComponent;
  component.preload = loadAnimatedSet;
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
    animated: animated((set) => set.FolderOpen),
  },
  journal: {
    static: CalendarDaysIcon,
    animated: animated((set) => set.CalendarDays),
  },
  tasks: {
    static: ListTodoIcon,
  },
  tags: {
    static: TagsIcon,
    animated: animated((set) => set.Tags),
  },
  people: {
    static: UsersIcon,
    animated: animated((set) => set.Users),
  },
  trash: {
    static: Trash2Icon,
    animated: animated((set) => set.Trash2),
  },
  settings: {
    static: SettingsIcon,
    animated: animated((set) => set.Settings),
  },
  "previous-note": {
    static: ChevronLeftIcon,
    animated: animated((set) => set.ChevronLeft),
  },
  "next-note": {
    static: ChevronRightIcon,
    animated: animated((set) => set.ChevronRight),
  },
  "version-history": {
    static: RotateCcwIcon,
    animated: animated((set) => set.RotateCcw),
  },
  "toggle-sidebar": {
    static: PanelLeftToggleIcon,
    animated: animated((set) => set.PanelLeft),
  },
  "find-in-note": {
    static: SearchIcon,
  },
  "toggle-metadata": {
    static: PanelRightToggleIcon,
    animated: animated((set) => set.PanelRight),
  },
} as const satisfies Record<string, IconEntry>;

export type AppIconName = keyof typeof APP_ICONS;
