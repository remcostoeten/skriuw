import { arcBand, outlineCircle, outlineRect } from "./shapes";

/**
 * A region of the 24-unit grid, as polygon path data. `outside` selects its
 * complement within the icon box, so two parts sharing a cut split the glyph
 * without overlap.
 */
export type Cut = { d: string; outside?: boolean };

export type PartSource = {
  id: string;
  /** Indices into the glyph's subpaths (see `splitSubpaths`), or extra path data. */
  subpaths?: readonly number[];
  d?: string;
  /** Clip that moves with the part: which slice of the glyph this part owns. */
  clip?: Cut;
  /** Clip fixed to the parent frame: the opening the part is seen through. */
  window?: Cut | { subpaths: readonly number[] };
  /** Renders inside another part's transform, so it moves along with it. */
  within?: string;
  /**
   * Hidden at rest behind another part: the listed glyph subpaths, moving with
   * `follows`, mask this part out.
   */
  occluder?: { follows: string; subpaths: readonly number[] };
  /** How the part is kept invisible at rest, for parts that are not in the glyph. */
  hidden?: "opacity" | "window" | "occluder";
};

export type AnimatedGlyphSource = {
  glyph: string;
  parts: readonly PartSource[];
};

function above(y: number): Cut {
  return { d: `M-2 -2H26V${y}H-2Z` };
}

function below(y: number): Cut {
  return { ...above(y), outside: true };
}

function column(from: number, to: number): Cut {
  return { d: `M${from} -2H${to}V26H${from}Z` };
}

const FOLDER_FLAP: Cut = { d: "M3.5 14.1L5.4 10.75C6.07 9.58 7.32 8.85 8.72 8.85H26V26H3.5Z" };
const PIN_HEAD: Cut = { d: "M-2 6.5L17.5 26H26V-2H-2Z" };
const SIDEBAR_DIVIDER: Cut = { d: "M8 5.5H9.5V18.5H8Z" };
const METADATA_DIVIDER: Cut = { d: "M14.5 5.5H16V18.5H14.5Z" };

/**
 * How each animated icon's Fluent glyph is divided into the parts its motion
 * moves. Every glyph subpath is owned by exactly one visible part (or split
 * between parts by complementary cuts), which `geometry.test.ts` verifies by
 * sampling, so the parts at rest redraw the static glyph exactly.
 */
export const ANIMATED_GLYPH_SOURCES = {
  notes: {
    glyph: "folder_open",
    parts: [
      { id: "back", subpaths: [0, 1, 2], clip: { ...FOLDER_FLAP, outside: true } },
      {
        id: "sheet",
        d: outlineRect(9.5, 12, 6.5, 7, 1.5),
        occluder: { follows: "flap", subpaths: [2] },
        hidden: "occluder",
      },
      { id: "flap", subpaths: [0, 1, 2], clip: FOLDER_FLAP },
    ],
  },
  journal: {
    glyph: "calendar_ltr",
    parts: [
      { id: "frame", subpaths: [0, 1, 7] },
      { id: "days", subpaths: [2, 4, 5, 6], window: { subpaths: [1] } },
      { id: "mark", subpaths: [3] },
    ],
  },
  tasks: {
    glyph: "task_list_ltr",
    parts: [
      { id: "c1", subpaths: [0] },
      { id: "c2", subpaths: [5] },
      { id: "c3", subpaths: [4] },
      { id: "l1", subpaths: [3] },
      { id: "l2", subpaths: [2] },
      { id: "l3", subpaths: [1] },
    ],
  },
  tags: {
    glyph: "tag",
    parts: [{ id: "swing", subpaths: [0, 1, 2] }],
  },
  people: {
    glyph: "people",
    parts: [
      { id: "back", subpaths: [2, 3, 4] },
      { id: "body", subpaths: [5, 6] },
      { id: "head", subpaths: [0, 1] },
    ],
  },
  trash: {
    glyph: "delete",
    parts: [
      { id: "lid", subpaths: [0, 1, 4], clip: above(6.5) },
      { id: "bin", subpaths: [0, 1, 4], clip: below(6.5) },
      { id: "s1", subpaths: [2] },
      { id: "s2", subpaths: [3] },
    ],
  },
  settings: {
    glyph: "settings",
    parts: [
      { id: "gear", subpaths: [0, 1] },
      { id: "hub", subpaths: [2, 3] },
    ],
  },
  search: {
    glyph: "search",
    parts: [
      { id: "lens", subpaths: [0, 1] },
      {
        id: "glint",
        d: arcBand(11, 11, 3.75, 195, 255, 1.25),
        within: "lens",
        window: { subpaths: [1] },
        hidden: "window",
      },
    ],
  },
  newnote: {
    glyph: "note_edit",
    parts: [
      { id: "page", subpaths: [0, 1] },
      { id: "pen", subpaths: [2] },
    ],
  },
  plus: {
    glyph: "add",
    parts: [{ id: "arms", subpaths: [0] }],
  },
  close: {
    glyph: "dismiss",
    parts: [{ id: "xs", subpaths: [0] }],
  },
  menu: {
    glyph: "navigation",
    parts: [
      { id: "m1", subpaths: [2] },
      { id: "m2", subpaths: [1] },
      { id: "m3", subpaths: [0] },
    ],
  },
  more: {
    glyph: "more_horizontal",
    parts: [
      { id: "d1", subpaths: [0] },
      { id: "d3", subpaths: [2] },
      { id: "d2", subpaths: [1] },
    ],
  },
  pin: {
    glyph: "pin",
    parts: [
      { id: "ripple", d: outlineCircle(3.5, 20.5, 2.75, 1), hidden: "opacity" },
      { id: "needle", subpaths: [0, 1], clip: { ...PIN_HEAD, outside: true } },
      { id: "head", subpaths: [0, 1], clip: PIN_HEAD },
    ],
  },
  lock: {
    glyph: "lock_closed",
    parts: [
      { id: "shackle", subpaths: [0, 1, 3], clip: above(8) },
      { id: "body", subpaths: [0, 1, 3], clip: below(8) },
      { id: "hole", subpaths: [2] },
    ],
  },
  history: {
    glyph: "history",
    parts: [
      { id: "ring", subpaths: [0] },
      { id: "hands", subpaths: [1] },
    ],
  },
  sidebar: {
    glyph: "panel_left",
    parts: [
      { id: "frame", subpaths: [0, 1, 2], clip: { ...SIDEBAR_DIVIDER, outside: true } },
      { id: "divider", subpaths: [0, 1, 2], clip: SIDEBAR_DIVIDER },
    ],
  },
  metadata: {
    glyph: "panel_right",
    parts: [
      { id: "frame", subpaths: [0, 1, 2], clip: { ...METADATA_DIVIDER, outside: true } },
      { id: "divider", subpaths: [0, 1, 2], clip: METADATA_DIVIDER },
    ],
  },
  sync: {
    glyph: "arrow_sync",
    parts: [{ id: "spin", subpaths: [0, 1] }],
  },
  account: {
    glyph: "person_circle",
    parts: [
      { id: "ring", subpaths: [2, 3] },
      { id: "head", subpaths: [1] },
      { id: "shoulders", subpaths: [0] },
    ],
  },
  back: {
    glyph: "chevron_left",
    parts: [
      { id: "ghost", subpaths: [0], hidden: "opacity" },
      { id: "c", subpaths: [0] },
    ],
  },
  fwd: {
    glyph: "chevron_right",
    parts: [
      { id: "ghost", subpaths: [0], hidden: "opacity" },
      { id: "c", subpaths: [0] },
    ],
  },
  bold: {
    glyph: "text_bold",
    parts: [{ id: "b", subpaths: [0, 1, 2] }],
  },
  italic: {
    glyph: "text_italic",
    parts: [{ id: "it", subpaths: [0] }],
  },
  heading: {
    glyph: "text_header_1",
    parts: [
      { id: "p1", subpaths: [1], clip: column(-2, 3.5) },
      { id: "bar", subpaths: [1], clip: column(3.5, 10) },
      { id: "p2", subpaths: [1], clip: column(10, 26) },
      { id: "one", subpaths: [0] },
    ],
  },
  link: {
    glyph: "link",
    parts: [
      { id: "la", subpaths: [0] },
      { id: "lb", subpaths: [1] },
      { id: "bar", subpaths: [2] },
    ],
  },
  quote: {
    glyph: "text_quote",
    parts: [
      { id: "q1", subpaths: [0, 2] },
      { id: "q2", subpaths: [1, 3] },
    ],
  },
  code: {
    glyph: "code",
    parts: [
      { id: "bl", subpaths: [1] },
      { id: "br", subpaths: [2] },
      { id: "sl", subpaths: [0] },
    ],
  },
  image: {
    glyph: "image",
    parts: [
      { id: "frame", subpaths: [0, 1, 2] },
      { id: "sun", subpaths: [3, 4], window: { subpaths: [2] } },
    ],
  },
} as const satisfies Record<string, AnimatedGlyphSource>;

export type AnimatedIconId = keyof typeof ANIMATED_GLYPH_SOURCES;
