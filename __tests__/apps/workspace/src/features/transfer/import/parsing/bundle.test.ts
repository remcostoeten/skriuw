import assert from "node:assert/strict";
import { test } from "vitest";
import { titleFromLeadingHeading, withFileTimes } from "@/features/transfer/import/parsing/bundle";

test("lifts a leading level-one heading into the title", () => {
  assert.deepEqual(titleFromLeadingHeading("\n# Roadmap #\n\nShip it", "roadmap"), {
    title: "Roadmap",
    markdown: "Ship it",
  });
  assert.deepEqual(titleFromLeadingHeading("# Only", "only"), { title: "Only", markdown: "" });
});

test("keeps the fallback title when the body does not open with a level-one heading", () => {
  for (const markdown of [
    "## Section\n\nBody",
    "Intro\n\n# Later",
    "#hashtag",
    `# ${"x".repeat(201)}`,
  ]) {
    assert.deepEqual(titleFromLeadingHeading(markdown, "file"), { title: "file", markdown });
  }
});

test("dates notes with their file times unless the source dated them", () => {
  const bundle = withFileTimes(
    {
      sourceId: "markdown",
      sourceLabel: "Markdown",
      directories: [],
      notes: [
        { relativePath: "a.md", title: "a", markdown: "" },
        { relativePath: "b.md", title: "b", markdown: "", createdAt: 1, modifiedAt: 2 },
        { relativePath: "c.md", title: "c", markdown: "" },
      ],
      warnings: [],
    },
    {
      directories: [],
      files: [
        { relativePath: "a.md", content: "", createdAt: 10, modifiedAt: 20 },
        { relativePath: "b.md", content: "", createdAt: 10, modifiedAt: 20 },
        { relativePath: "c.md", content: "", createdAt: null, modifiedAt: null },
      ],
      skipped: 0,
    },
  );
  assert.deepEqual(
    bundle.notes.map((note) => [note.createdAt, note.modifiedAt]),
    [
      [10, 20],
      [1, 2],
      [undefined, undefined],
    ],
  );
});
