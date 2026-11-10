import { describe, expect, it } from "vitest";
import {
  currentInspectorSection,
  findRevisionSplit,
  readingMinutes,
  sectionForNumberKey,
  signedWordDelta,
  stepIndex,
  visibleInspectorSections,
} from "@/features/note-chrome/metadata/inspector-model";

describe("visibleInspectorSections", () => {
  it("always keeps revisions and details", () => {
    expect(
      visibleInspectorSections({ outline: false, comments: false, relationships: false }),
    ).toEqual(["revisions", "details"]);
  });

  it("keeps panel order when every section has content", () => {
    expect(
      visibleInspectorSections({ outline: true, comments: true, relationships: true }),
    ).toEqual(["outline", "comments", "revisions", "relationships", "details"]);
  });

  it("drops only the sections without content", () => {
    expect(
      visibleInspectorSections({ outline: false, comments: true, relationships: false }),
    ).toEqual(["comments", "revisions", "details"]);
  });
});

describe("sectionForNumberKey", () => {
  const visible = ["comments", "revisions", "details"] as const;

  it("maps a digit to the section at that position", () => {
    expect(sectionForNumberKey("1", visible)).toBe("comments");
    expect(sectionForNumberKey("3", visible)).toBe("details");
  });

  it("ignores digits past the list and non-digit keys", () => {
    expect(sectionForNumberKey("4", visible)).toBeNull();
    expect(sectionForNumberKey("0", visible)).toBeNull();
    expect(sectionForNumberKey("a", visible)).toBeNull();
    expect(sectionForNumberKey("10", visible)).toBeNull();
  });
});

describe("currentInspectorSection", () => {
  const tops = [
    { section: "outline", top: -300 },
    { section: "comments", top: -40 },
    { section: "revisions", top: 200 },
  ] as const;

  it("picks the last section that reached the reading line", () => {
    expect(currentInspectorSection(tops, 80, false)).toBe("comments");
    expect(currentInspectorSection(tops, 250, false)).toBe("revisions");
  });

  it("falls back to the first section before any reaches the line", () => {
    expect(
      currentInspectorSection(
        [
          { section: "outline", top: 120 },
          { section: "comments", top: 400 },
        ],
        80,
        false,
      ),
    ).toBe("outline");
  });

  it("picks the last section at the end of the scroll", () => {
    expect(currentInspectorSection(tops, 80, true)).toBe("revisions");
  });

  it("returns null with no sections", () => {
    expect(currentInspectorSection([], 80, false)).toBeNull();
  });
});

describe("stepIndex", () => {
  it("stops at both ends", () => {
    expect(stepIndex(3, 0, -1)).toBe(0);
    expect(stepIndex(3, 2, 1)).toBe(2);
    expect(stepIndex(3, 1, 1)).toBe(2);
  });

  it("enters from outside the list at the near end", () => {
    expect(stepIndex(3, -1, 1)).toBe(0);
    expect(stepIndex(3, -1, -1)).toBe(2);
  });

  it("has nowhere to go in an empty list", () => {
    expect(stepIndex(0, -1, 1)).toBe(-1);
  });
});

describe("readingMinutes", () => {
  it("rounds up and never drops below one minute", () => {
    expect(readingMinutes(0)).toBe(1);
    expect(readingMinutes(200)).toBe(1);
    expect(readingMinutes(201)).toBe(2);
    expect(readingMinutes(1284)).toBe(7);
  });
});

describe("signedWordDelta", () => {
  it("signs gains and losses and shows zero plainly", () => {
    expect(signedWordDelta(48)).toBe("+48");
    expect(signedWordDelta(-6)).toBe("−6");
    expect(signedWordDelta(0)).toBe("0");
  });

  it("is empty when the change is unknown", () => {
    expect(signedWordDelta(null)).toBe("");
  });
});

describe("findRevisionSplit", () => {
  const rows = [
    { kind: "group" },
    { kind: "version" },
    { kind: "version" },
    { kind: "group" },
    { kind: "version" },
    { kind: "version" },
  ] as const;

  it("splits just past the limit-th revision", () => {
    expect(findRevisionSplit(rows, 2)).toBe(3);
    expect(findRevisionSplit(rows, 3)).toBe(5);
  });

  it("keeps a day header with its revisions", () => {
    expect(findRevisionSplit(rows, 2)).toBeLessThan(4);
  });

  it("keeps everything when the limit is not reached", () => {
    expect(findRevisionSplit(rows, 9)).toBe(rows.length);
    expect(findRevisionSplit([], 5)).toBe(0);
  });
});
