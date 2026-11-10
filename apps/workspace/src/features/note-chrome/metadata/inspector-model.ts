export type InspectorSection = "outline" | "comments" | "revisions" | "relationships" | "details";

export const INSPECTOR_SECTIONS: readonly InspectorSection[] = [
  "outline",
  "comments",
  "revisions",
  "relationships",
  "details",
];

export type InspectorPresence = {
  outline: boolean;
  comments: boolean;
  relationships: boolean;
};

export type SectionTop = {
  section: InspectorSection;
  top: number;
};

const WORDS_PER_MINUTE = 200;

/**
 * @name visibleInspectorSections
 * @description Lists the inspector sections the note has content for, in panel
 * order. Revisions and details always show; the others leave the panel and its
 * section index when they would be empty.
 *
 * @example
 * visibleInspectorSections({ outline: false, comments: true, relationships: false });
 * // ["comments", "revisions", "details"]
 */
export function visibleInspectorSections(presence: InspectorPresence): InspectorSection[] {
  return INSPECTOR_SECTIONS.filter((section) => {
    if (section === "outline") return presence.outline;
    if (section === "comments") return presence.comments;
    if (section === "relationships") return presence.relationships;
    return true;
  });
}

/**
 * @name sectionForNumberKey
 * @description Maps a digit key to the section at that position in the visible
 * list, or null when the key is not a digit or no section sits there.
 *
 * @example
 * sectionForNumberKey("2", ["comments", "revisions", "details"]); // "revisions"
 */
export function sectionForNumberKey(
  key: string,
  visible: readonly InspectorSection[],
): InspectorSection | null {
  if (!/^[1-9]$/.test(key)) {
    return null;
  }
  return visible[Number(key) - 1] ?? null;
}

/**
 * @name currentInspectorSection
 * @description Picks the section the panel is scrolled to: the last one whose
 * top has reached the reading line, or the last section once the panel is
 * scrolled to its end. Tops are viewport offsets relative to the scroller.
 *
 * @example
 * currentInspectorSection(
 *   [{ section: "outline", top: -120 }, { section: "revisions", top: 40 }],
 *   80,
 *   false,
 * ); // "revisions"
 */
export function currentInspectorSection(
  tops: readonly SectionTop[],
  readingLine: number,
  atEnd: boolean,
): InspectorSection | null {
  const first = tops[0];
  if (!first) {
    return null;
  }
  if (atEnd) {
    return tops[tops.length - 1]?.section ?? null;
  }
  let current = first.section;
  for (const entry of tops) {
    if (entry.top <= readingLine) {
      current = entry.section;
    }
  }
  return current;
}

/**
 * @name stepIndex
 * @description Moves an index one step through a list of `length` items and
 * stops at either end. An index of -1 (nothing focused) enters at the first
 * item going down and the last going up.
 *
 * @example
 * stepIndex(3, 2, 1); // 2
 */
export function stepIndex(length: number, index: number, direction: 1 | -1): number {
  if (length === 0) {
    return -1;
  }
  if (index < 0) {
    return direction === 1 ? 0 : length - 1;
  }
  return Math.min(length - 1, Math.max(0, index + direction));
}

/**
 * @name readingMinutes
 * @description Whole minutes needed to read a note at 200 words per minute,
 * never less than one.
 *
 * @example
 * readingMinutes(450); // 3
 */
export function readingMinutes(wordCount: number): number {
  return Math.max(1, Math.ceil(wordCount / WORDS_PER_MINUTE));
}

/**
 * @name signedWordDelta
 * @description Formats a revision's word change as a signed number with a true
 * minus sign, or an empty string when the change is unknown.
 *
 * @example
 * signedWordDelta(-6); // "−6"
 */
export function signedWordDelta(delta: number | null): string {
  if (delta === null) {
    return "";
  }
  if (delta > 0) {
    return `+${delta}`;
  }
  return delta < 0 ? `−${Math.abs(delta)}` : "0";
}

export type DayRow = { kind: "group" } | { kind: "version" };

/**
 * @name findRevisionSplit
 * @description Returns the index just past the `limit`-th revision row so a
 * grouped revision list can split into an always-visible head and a foldable
 * tail. A day header stays with the revisions it introduces because only
 * version rows count toward the limit.
 *
 * @example
 * findRevisionSplit([{ kind: "group" }, { kind: "version" }, { kind: "version" }], 1); // 2
 */
export function findRevisionSplit(rows: readonly DayRow[], limit: number): number {
  let seen = 0;
  for (let index = 0; index < rows.length; index += 1) {
    if (rows[index]?.kind === "version") {
      seen += 1;
      if (seen === limit) {
        return index + 1;
      }
    }
  }
  return rows.length;
}
