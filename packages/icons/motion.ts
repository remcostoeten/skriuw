import type { EasingToken } from "./easing";
import type { AnimatedIconId } from "./parts";

/** A part's pose relative to rest. Omitted fields are the identity. */
export type Pose = {
  x?: number;
  y?: number;
  rotate?: number;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  skewX?: number;
  opacity?: number;
};

export type Keyframe = Pose & {
  /** Offset within the track's duration, 0 to 1. */
  at: number;
  /** Curve from this keyframe to the next; defaults to the track's curve. */
  ease?: EasingToken;
};

export type Track = {
  part: string;
  duration: number;
  delay?: number;
  ease: EasingToken;
  /** Transform origin in grid units of the 24-unit view box. */
  origin: readonly [number, number];
  keyframes: readonly Keyframe[];
};

export type IconMotion = {
  tracks: readonly Track[];
  /**
   * Rotation the icon ends on when it is not the identity. The glyph must be
   * symmetric under it, so the last frame is indistinguishable from rest.
   */
  endsOnSymmetry?: number;
};

/**
 * The approved hover animations, ported from the review page's CSS keyframes
 * onto the Fluent glyphs. Durations are in milliseconds at the approved pace.
 * `apps/docs/content/v2/adr/0049-shared-icon-system.md` lists where a motion was adapted from
 * the line drawings it was designed on.
 */
export const ICON_MOTIONS: Record<AnimatedIconId, IconMotion> = {
  notes: {
    tracks: [
      {
        part: "flap",
        duration: 760,
        ease: "spring",
        origin: [3.5, 21],
        keyframes: [{ at: 0 }, { at: 0.4, y: 0.8, rotate: 7 }, { at: 1 }],
      },
      {
        part: "sheet",
        duration: 760,
        delay: 40,
        ease: "spring",
        origin: [12.1, 19],
        keyframes: [{ at: 0 }, { at: 0.4, y: -5.5, rotate: -6 }, { at: 1 }],
      },
      {
        part: "back",
        duration: 760,
        ease: "spring",
        origin: [3.5, 21],
        keyframes: [{ at: 0 }, { at: 0.4, rotate: -2 }, { at: 1 }],
      },
    ],
  },
  journal: {
    tracks: [
      {
        part: "days",
        duration: 760,
        ease: "inout",
        origin: [12, 13.75],
        keyframes: [
          { at: 0 },
          { at: 0.18 },
          { at: 0.42, x: -14 },
          { at: 0.43, x: 14 },
          { at: 0.72 },
          { at: 1 },
        ],
      },
      {
        part: "mark",
        duration: 760,
        ease: "out",
        origin: [12, 15.75],
        keyframes: [
          { at: 0 },
          { at: 0.22, x: -4.25, scale: 0.8 },
          { at: 0.58, x: -4.25, scale: 0.8, ease: "spring" },
          { at: 0.78, y: -1.2, scale: 1.25 },
          { at: 1 },
        ],
      },
    ],
  },
  tasks: {
    tracks: [
      ...(
        [
          ["c1", 0, [3.76, 7.51]],
          ["c2", 110, [3.74, 14.01]],
          ["c3", 220, [3.77, 20.5]],
        ] as const
      ).map(([part, delay, origin]): Track => ({
        part,
        duration: 820,
        delay,
        ease: "out",
        origin,
        keyframes: [
          { at: 0 },
          { at: 0.22, scale: 0.8, rotate: -10 },
          { at: 0.55, scale: 1.15 },
          { at: 1 },
        ],
      })),
      ...(
        [
          ["l1", 0, 5.74],
          ["l2", 110, 12.24],
          ["l3", 220, 18.76],
        ] as const
      ).map(([part, delay, y]): Track => ({
        part,
        duration: 820,
        delay,
        ease: "spring",
        origin: [8.95, y],
        keyframes: [{ at: 0 }, { at: 0.2 }, { at: 0.5, x: 1.6 }, { at: 1 }],
      })),
    ],
  },
  tags: {
    tracks: [
      {
        part: "swing",
        duration: 1100,
        ease: "linear",
        origin: [17, 7],
        keyframes: [
          { at: 0, ease: "swing" },
          { at: 0.2, rotate: 14, ease: "sine" },
          { at: 0.42, rotate: -8, ease: "sine" },
          { at: 0.62, rotate: 4, ease: "sine" },
          { at: 0.8, rotate: -1.5, ease: "sine" },
          { at: 1 },
        ],
      },
    ],
  },
  people: {
    tracks: [
      {
        part: "back",
        duration: 760,
        ease: "out",
        origin: [17, 20],
        keyframes: [{ at: 0 }, { at: 0.18, y: 1.5, scale: 0.9 }, { at: 0.62, y: -0.6 }, { at: 1 }],
      },
      {
        part: "head",
        duration: 760,
        ease: "out",
        origin: [8, 14],
        keyframes: [{ at: 0 }, { at: 0.3 }, { at: 0.55, rotate: 9 }, { at: 1 }],
      },
    ],
  },
  trash: {
    tracks: [
      {
        part: "lid",
        duration: 820,
        ease: "linear",
        origin: [12, 6.5],
        keyframes: [
          { at: 0, ease: "out" },
          { at: 0.3, y: -3.2, ease: "standard" },
          { at: 0.52, y: -3.6, ease: "accelerate" },
          { at: 0.66, y: 0.5, ease: "out" },
          { at: 1 },
        ],
      },
      {
        part: "bin",
        duration: 820,
        ease: "out",
        origin: [12, 22],
        keyframes: [{ at: 0 }, { at: 0.62 }, { at: 0.7, scaleX: 1.04, scaleY: 0.94 }, { at: 1 }],
      },
      ...(["s1", "s2"] as const).map((part): Track => ({
        part,
        duration: 820,
        ease: "out",
        origin: [12, 22],
        keyframes: [{ at: 0 }, { at: 0.62 }, { at: 0.72, scaleY: 0.9 }, { at: 1 }],
      })),
    ],
  },
  settings: {
    endsOnSymmetry: 60,
    tracks: [
      {
        part: "gear",
        duration: 900,
        ease: "linear",
        origin: [12, 12],
        keyframes: [
          { at: 0, ease: "spring" },
          { at: 0.42, rotate: 30 },
          { at: 0.5, rotate: 30, ease: "spring" },
          { at: 0.92, rotate: 60 },
          { at: 1, rotate: 60 },
        ],
      },
      {
        part: "hub",
        duration: 900,
        ease: "linear",
        origin: [12, 12],
        keyframes: [
          { at: 0, ease: "out" },
          { at: 0.12, scale: 0.78, ease: "spring" },
          { at: 0.4 },
          { at: 0.5, ease: "out" },
          { at: 0.62, scale: 0.78, ease: "spring" },
          { at: 0.9 },
          { at: 1 },
        ],
      },
    ],
  },
  search: {
    tracks: [
      {
        part: "lens",
        duration: 900,
        ease: "inout",
        origin: [11, 11],
        keyframes: [
          { at: 0 },
          { at: 0.25, x: -1.6, y: -1.2 },
          { at: 0.5, x: 1.4, y: -1.6 },
          { at: 0.75, x: 0.8, y: 0.8 },
          { at: 1 },
        ],
      },
      {
        part: "glint",
        duration: 900,
        ease: "inout",
        origin: [11, 11],
        keyframes: [
          { at: 0, x: -9, y: -9 },
          { at: 0.3, x: -9, y: -9 },
          { at: 1, x: 9, y: 9 },
        ],
      },
    ],
  },
  newnote: {
    tracks: [
      {
        part: "pen",
        duration: 900,
        ease: "linear",
        origin: [13, 22],
        keyframes: [
          { at: 0, ease: "out" },
          { at: 0.25, x: 1.4, y: -1.4, rotate: 10, ease: "swoop" },
          { at: 0.45, x: -0.6, y: 0.6, rotate: -4, ease: "sine" },
          { at: 0.58, x: 0.2, y: 0.3, rotate: 3, ease: "sine" },
          { at: 0.7, x: -0.3, y: 0.5, rotate: -2, ease: "spring" },
          { at: 1 },
        ],
      },
      {
        part: "page",
        duration: 900,
        ease: "out",
        origin: [12, 12],
        keyframes: [{ at: 0 }, { at: 0.4 }, { at: 0.5, scale: 0.96 }, { at: 1 }],
      },
    ],
  },
  plus: {
    endsOnSymmetry: 90,
    tracks: [
      {
        part: "arms",
        duration: 620,
        ease: "spring",
        origin: [12, 12],
        keyframes: [{ at: 0 }, { at: 0.4, rotate: 60, scale: 0.82 }, { at: 1, rotate: 90 }],
      },
    ],
  },
  close: {
    endsOnSymmetry: 90,
    tracks: [
      {
        part: "xs",
        duration: 620,
        ease: "spring",
        origin: [12, 12],
        keyframes: [{ at: 0 }, { at: 0.4, rotate: 60, scale: 0.8 }, { at: 1, rotate: 90 }],
      },
    ],
  },
  menu: {
    tracks: (
      [
        ["m1", 0, 5.75, 0.55],
        ["m2", 50, 12.25, 0.85],
        ["m3", 100, 18.75, 0.35],
      ] as const
    ).map(([part, delay, y, scaleX]): Track => ({
      part,
      duration: 700,
      delay,
      ease: "out",
      origin: [2, y],
      keyframes: [{ at: 0 }, { at: 0.4, scaleX }, { at: 1 }],
    })),
  },
  more: {
    tracks: [
      {
        part: "d1",
        duration: 700,
        ease: "inout",
        origin: [6, 12],
        keyframes: [{ at: 0 }, { at: 0.4, x: 6 }, { at: 0.52, x: 6 }, { at: 1 }],
      },
      {
        part: "d3",
        duration: 700,
        ease: "inout",
        origin: [18, 12],
        keyframes: [{ at: 0 }, { at: 0.4, x: -6 }, { at: 0.52, x: -6 }, { at: 1 }],
      },
      {
        part: "d2",
        duration: 700,
        ease: "out",
        origin: [12, 12],
        keyframes: [{ at: 0 }, { at: 0.4, scale: 1.5 }, { at: 0.52, scale: 1.35 }, { at: 1 }],
      },
    ],
  },
  pin: {
    tracks: [
      {
        part: "head",
        duration: 760,
        ease: "out",
        origin: [8, 16],
        keyframes: [
          { at: 0 },
          { at: 0.3, x: 2.1, y: -2.1, rotate: -10 },
          { at: 0.52, x: -0.85, y: 0.85, scale: 0.94 },
          { at: 0.72, x: 0.2, y: -0.2 },
          { at: 1 },
        ],
      },
      {
        part: "ripple",
        duration: 760,
        ease: "out",
        origin: [3.5, 20.5],
        keyframes: [
          { at: 0, scale: 0.2, opacity: 0 },
          { at: 0.5, scale: 0.2, opacity: 0 },
          { at: 0.56, scale: 0.48, opacity: 1 },
          { at: 1, scale: 1, opacity: 0 },
        ],
      },
    ],
  },
  lock: {
    tracks: [
      {
        part: "shackle",
        duration: 1000,
        ease: "out",
        origin: [7.75, 8],
        keyframes: [
          { at: 0 },
          { at: 0.22, y: -2.6 },
          { at: 0.42, y: -2.6, rotate: -30 },
          { at: 0.58, y: -2.6, rotate: -30 },
          { at: 0.76, y: -2.6 },
          { at: 0.88, y: 0.5 },
          { at: 1 },
        ],
      },
      {
        part: "hole",
        duration: 1000,
        ease: "out",
        origin: [12, 15],
        keyframes: [{ at: 0 }, { at: 0.8 }, { at: 0.88, scale: 1.6 }, { at: 1 }],
      },
    ],
  },
  history: {
    tracks: [
      {
        part: "hands",
        duration: 900,
        ease: "inout",
        origin: [11.75, 12.24],
        keyframes: [{ at: 0 }, { at: 1, rotate: -360 }],
      },
      {
        part: "ring",
        duration: 900,
        ease: "out",
        origin: [12, 12],
        keyframes: [{ at: 0 }, { at: 0.3, rotate: -28 }, { at: 1 }],
      },
    ],
  },
  sidebar: {
    tracks: [
      {
        part: "divider",
        duration: 700,
        ease: "out",
        origin: [8.75, 12],
        keyframes: [{ at: 0 }, { at: 0.4, x: -3.5 }, { at: 0.72, x: 0.6 }, { at: 1 }],
      },
    ],
  },
  metadata: {
    tracks: [
      {
        part: "divider",
        duration: 700,
        ease: "out",
        origin: [15.25, 12],
        keyframes: [{ at: 0 }, { at: 0.4, x: 3.5 }, { at: 0.72, x: -0.6 }, { at: 1 }],
      },
    ],
  },
  sync: {
    endsOnSymmetry: 180,
    tracks: [
      {
        part: "spin",
        duration: 820,
        ease: "inout",
        origin: [12, 12],
        keyframes: [{ at: 0 }, { at: 0.2, rotate: -20 }, { at: 1, rotate: 180 }],
      },
    ],
  },
  account: {
    tracks: [
      {
        part: "ring",
        duration: 820,
        ease: "spring",
        origin: [12, 12],
        keyframes: [{ at: 0 }, { at: 0.35, scale: 1.06 }, { at: 1 }],
      },
      {
        part: "head",
        duration: 820,
        ease: "spring",
        origin: [12, 8.25],
        keyframes: [{ at: 0 }, { at: 0.35, y: -1.4 }, { at: 1 }],
      },
      {
        part: "shoulders",
        duration: 820,
        delay: 60,
        ease: "spring",
        origin: [12, 15],
        keyframes: [{ at: 0 }, { at: 0.35, y: -0.6 }, { at: 1 }],
      },
    ],
  },
  back: {
    tracks: [
      {
        part: "c",
        duration: 560,
        ease: "out",
        origin: [12, 12],
        keyframes: [{ at: 0 }, { at: 0.35, x: -3.5 }, { at: 1 }],
      },
      {
        part: "ghost",
        duration: 560,
        ease: "out",
        origin: [12, 12],
        keyframes: [
          { at: 0, opacity: 0 },
          { at: 0.2, x: -1, opacity: 0.45 },
          { at: 0.6, x: -3, opacity: 0 },
          { at: 1, opacity: 0 },
        ],
      },
    ],
  },
  fwd: {
    tracks: [
      {
        part: "c",
        duration: 560,
        ease: "out",
        origin: [12, 12],
        keyframes: [{ at: 0 }, { at: 0.35, x: 3.5 }, { at: 1 }],
      },
      {
        part: "ghost",
        duration: 560,
        ease: "out",
        origin: [12, 12],
        keyframes: [
          { at: 0, opacity: 0 },
          { at: 0.2, x: 1, opacity: 0.45 },
          { at: 0.6, x: 3, opacity: 0 },
          { at: 1, opacity: 0 },
        ],
      },
    ],
  },
  bold: {
    tracks: [
      {
        part: "b",
        duration: 620,
        ease: "linear",
        origin: [12.25, 20],
        keyframes: [
          { at: 0, ease: "out" },
          { at: 0.3, y: -1.5, scale: 1.1, ease: "accelerate" },
          { at: 0.48, scaleX: 1.08, scaleY: 0.9, ease: "spring" },
          { at: 1 },
        ],
      },
    ],
  },
  italic: {
    tracks: [
      {
        part: "it",
        duration: 700,
        ease: "out",
        origin: [12, 12],
        keyframes: [{ at: 0 }, { at: 0.4, skewX: 21 }, { at: 0.75, skewX: -5 }, { at: 1 }],
      },
    ],
  },
  heading: {
    tracks: [
      {
        part: "p1",
        duration: 700,
        ease: "spring",
        origin: [2.75, 12],
        keyframes: [{ at: 0 }, { at: 0.4, x: -1.6 }, { at: 1 }],
      },
      {
        part: "p2",
        duration: 700,
        ease: "spring",
        origin: [10.75, 12],
        keyframes: [{ at: 0 }, { at: 0.4, x: 1.6 }, { at: 1 }],
      },
      {
        part: "bar",
        duration: 700,
        ease: "spring",
        origin: [6.75, 11.75],
        keyframes: [{ at: 0 }, { at: 0.4, scaleX: 1.5 }, { at: 1 }],
      },
    ],
  },
  link: {
    tracks: [
      {
        part: "la",
        duration: 720,
        ease: "out",
        origin: [6, 12],
        keyframes: [{ at: 0 }, { at: 0.38, x: -2.2 }, { at: 0.58, x: 0.6 }, { at: 1 }],
      },
      {
        part: "lb",
        duration: 720,
        ease: "out",
        origin: [18, 12],
        keyframes: [{ at: 0 }, { at: 0.38, x: 2.2 }, { at: 0.58, x: -0.6 }, { at: 1 }],
      },
    ],
  },
  quote: {
    tracks: (
      [
        ["q1", 0, 8],
        ["q2", 110, 16],
      ] as const
    ).map(([part, delay, x]): Track => ({
      part,
      duration: 760,
      delay,
      ease: "linear",
      origin: [x, 17.98],
      keyframes: [
        { at: 0, ease: "out" },
        { at: 0.3, y: -3.5, rotate: -6, ease: "accelerate" },
        { at: 0.52, scaleY: 0.84, ease: "spring" },
        { at: 1 },
      ],
    })),
  },
  code: {
    endsOnSymmetry: 180,
    tracks: [
      {
        part: "bl",
        duration: 720,
        ease: "out",
        origin: [4.9, 12],
        keyframes: [{ at: 0 }, { at: 0.4, x: -2 }, { at: 1 }],
      },
      {
        part: "br",
        duration: 720,
        ease: "out",
        origin: [19.1, 12],
        keyframes: [{ at: 0 }, { at: 0.4, x: 2 }, { at: 1 }],
      },
      {
        part: "sl",
        duration: 720,
        ease: "inout",
        origin: [12, 12],
        keyframes: [{ at: 0 }, { at: 1, rotate: 180 }],
      },
    ],
  },
  image: {
    tracks: [
      {
        part: "sun",
        duration: 900,
        ease: "inout",
        origin: [15.25, 8.75],
        keyframes: [
          { at: 0 },
          { at: 0.4, x: 1.5, y: 11 },
          { at: 0.55, x: 1.5, y: 11 },
          { at: 0.56, y: 11 },
          { at: 1 },
        ],
      },
    ],
  },
};

/** Total running time of an icon's animation, including track delays. */
export function motionDuration(motion: IconMotion): number {
  return Math.max(...motion.tracks.map((track) => (track.delay ?? 0) + track.duration));
}
