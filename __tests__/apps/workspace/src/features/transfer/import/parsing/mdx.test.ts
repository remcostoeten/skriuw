import assert from "node:assert/strict";
import { test } from "vitest";
import { hasLosslessMarkdownDocument, parseProductMarkdown } from "@/features/editor/schema";
import { mdxToMarkdown, normalizeMdxTree } from "@/features/transfer/import/parsing/mdx";
import { detectImportSource } from "@/features/transfer/import/parsing/bundle";
import { importSources } from "@/features/transfer/import/sources/registry";

test("drops ESM statements, including ones spanning several lines", () => {
  const markdown = mdxToMarkdown(
    [
      'import { Callout } from "@/components/callout"',
      "export const meta = {",
      '  title: "Setup",',
      "}",
      "",
      "# Setup",
    ].join("\n"),
  );
  assert.equal(markdown.trim(), "# Setup");
});

test("unwraps components and removes the indentation of their children", () => {
  const markdown = mdxToMarkdown(
    [
      '<Callout type="warning">',
      "    **Careful** with this.",
      "",
      "    - one",
      "      - nested",
      "</Callout>",
      "After",
    ].join("\n"),
  );
  assert.equal(
    markdown,
    ["", "**Careful** with this.", "", "- one", "  - nested", "", "After"].join("\n"),
  );
});

test("drops self-closing and multi-line component tags", () => {
  const markdown = mdxToMarkdown(
    ["Intro", "", "<Video", '  src="/demo.mp4"', "  autoplay", "/>", "", "Outro"].join("\n"),
  );
  assert.deepEqual(
    markdown.split("\n").filter((line) => line.length > 0),
    ["Intro", "Outro"],
  );
});

test("strips inline components and JSX comments but not code spans", () => {
  assert.equal(
    mdxToMarkdown("Press <Kbd>Ctrl</Kbd> {/* hint */}to save, see `<Kbd>`."),
    "Press Ctrl to save, see `<Kbd>`.",
  );
});

test("keeps fenced code and frontmatter verbatim", () => {
  const source = [
    "---",
    "title: Guide",
    "---",
    "```tsx",
    'import { Callout } from "x"',
    "<Callout />",
    "```",
  ].join("\n");
  assert.equal(mdxToMarkdown(source), source);
});

test("converted MDX parses as structured Markdown instead of raw mode", () => {
  const markdown = mdxToMarkdown(
    ['import { Tabs } from "x"', "", "<Tabs>", "  ## Heading", "", "  Body text", "</Tabs>"].join(
      "\n",
    ),
  );
  const document = parseProductMarkdown(markdown).toJSON();
  assert.equal(hasLosslessMarkdownDocument(document), false);
  assert.equal(document.content?.[0]?.type, "heading");
});

test("renames MDX files to Markdown so every source reads them", () => {
  const tree = normalizeMdxTree({
    directories: [],
    files: [
      { relativePath: "guide.mdx", content: "<Note>\n  Hello\n</Note>" },
      { relativePath: "readme.md", content: "# Readme" },
      { relativePath: "readme.mdx", content: "Other" },
    ],
    skipped: 0,
  });
  assert.deepEqual(
    tree.files.map((file) => file.relativePath),
    ["guide.md", "readme.md", "readme (mdx).md"],
  );
  assert.equal(tree.files[0]?.content.trim(), "Hello");
  assert.equal(detectImportSource(importSources, tree)?.id, "markdown");
});
