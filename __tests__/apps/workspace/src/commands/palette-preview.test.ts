import { describe, expect, it } from "vitest";
import { notePreviewLines } from "@/commands/palette-preview";
import { paletteShortcutLabel } from "@/commands/palette-shortcut-label";

describe("notePreviewLines", () => {
  it("keeps headings, list items and paragraphs with their role", () => {
    expect(
      notePreviewLines("# Plan\n\nShip the palette.\n\n- first\n1. second\n- [x] done"),
    ).toEqual([
      { text: "Plan", tone: "heading" },
      { text: "Ship the palette.", tone: "text" },
      { text: "first", tone: "item" },
      { text: "second", tone: "item" },
      { text: "done", tone: "item" },
    ]);
  });

  it("drops front matter, fences, rules and inline markup", () => {
    const markdown = [
      "---",
      "title: Hidden",
      "---",
      "```ts",
      "const kept = true;",
      "```",
      "***",
      "> A **bold** [link](https://example.com) to [[target|a note]] and `code`.",
      "![diagram](image.png)",
    ].join("\n");
    expect(notePreviewLines(markdown)).toEqual([
      { text: "const kept = true;", tone: "text" },
      { text: "A bold link to a note and code.", tone: "text" },
    ]);
  });

  it("stops at the line limit", () => {
    const markdown = Array.from({ length: 30 }, (_, index) => `line ${index}`).join("\n");
    expect(notePreviewLines(markdown, 3)).toHaveLength(3);
  });

  it("returns nothing for an empty note", () => {
    expect(notePreviewLines("")).toEqual([]);
  });
});

describe("paletteShortcutLabel", () => {
  it("formats each step of a key sequence on its own", () => {
    expect(paletteShortcutLabel("g then m")).toBe("G M");
  });
});
