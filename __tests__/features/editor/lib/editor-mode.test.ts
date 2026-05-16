import { describe, expect, test } from "bun:test";
import { isMdxNote, resolveEditorMode } from "@/features/editor/lib/editor-mode";

describe("editor mode resolution", () => {
  test("keeps mdx extension files in raw mode", () => {
    expect(
      resolveEditorMode(
        {
          name: "MDX: Space Pancakes.mdx",
          content: "# Space Pancakes",
          preferredEditorMode: "block",
        },
        "block",
      ),
    ).toBe("raw");
  });

  test("detects mdx source syntax even without an mdx extension", () => {
    const content = `---
title: Component Gallery
---

import { Callout } from "@/components/skriuw";

<Callout tone="info">MDX stays source-editable.</Callout>
`;

    expect(isMdxNote({ name: "Component Gallery.md", content })).toBe(true);
    expect(
      resolveEditorMode(
        {
          name: "Component Gallery.md",
          content,
          preferredEditorMode: "block",
        },
        "block",
      ),
    ).toBe("raw");
  });

  test("preserves block mode for normal markdown", () => {
    expect(
      resolveEditorMode(
        {
          name: "Meeting notes.md",
          content: "# Meeting notes\n\n- One\n- Two",
          preferredEditorMode: "block",
        },
        "raw",
      ),
    ).toBe("block");
  });
});
