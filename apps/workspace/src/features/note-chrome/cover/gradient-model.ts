export type CoverGradient = {
  id: string;
  label: string;
  css: string;
};

function blend(from: string, to: string, angle: number): string {
  return `linear-gradient(${angle}deg, ${from}, ${to})`;
}

const RED = "#d2555a";
const ORANGE = "#d3803f";
const AMBER = "#c9a13c";
const GREEN = "#4d9d6e";
const TEAL = "#3f9d99";
const BLUE = "#5589cf";
const VIOLET = "#8a79ce";
const PINK = "#c66c98";
const SLATE = "#6b7280";

/**
 * The gradients a cover may name. Ids mirror `COVER_GRADIENT_IDS` in
 * `skriuw-domain`, which is the trust boundary: a workspace stores the id, and
 * only this table turns one into paint.
 */
export const COVER_GRADIENTS: readonly CoverGradient[] = [
  { id: "slate", label: "Slate", css: blend(SLATE, "#9aa2ad", 135) },
  { id: "crimson", label: "Crimson", css: blend(RED, ORANGE, 135) },
  { id: "sunset", label: "Sunset", css: blend(ORANGE, AMBER, 135) },
  { id: "gold", label: "Gold", css: blend(AMBER, GREEN, 135) },
  { id: "meadow", label: "Meadow", css: blend(GREEN, TEAL, 135) },
  { id: "lagoon", label: "Lagoon", css: blend(TEAL, BLUE, 135) },
  { id: "ocean", label: "Ocean", css: blend(BLUE, VIOLET, 135) },
  { id: "dusk", label: "Dusk", css: blend(VIOLET, PINK, 135) },
  { id: "bloom", label: "Bloom", css: blend(PINK, RED, 135) },
  { id: "aurora", label: "Aurora", css: blend(GREEN, VIOLET, 115) },
  { id: "midnight", label: "Midnight", css: blend(BLUE, SLATE, 160) },
  { id: "orchid", label: "Orchid", css: blend(VIOLET, BLUE, 115) },
];

const BY_ID = new Map(COVER_GRADIENTS.map((gradient) => [gradient.id, gradient]));

/**
 * Resolves a stored gradient id to its paint. An id this build does not know —
 * a workspace written by a newer version, or a corrupted row — resolves to
 * nothing so the cover falls back to plain chrome instead of injecting the
 * unrecognised value into a style attribute.
 */
export function coverGradientCss(id: string | null | undefined): string | null {
  if (id === null || id === undefined) {
    return null;
  }
  return BY_ID.get(id)?.css ?? null;
}

export function isCoverGradientId(id: string): boolean {
  return BY_ID.has(id);
}
