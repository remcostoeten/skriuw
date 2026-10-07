import assert from "node:assert/strict";
import { test } from "vitest";
import { parseProductMarkdown } from "@/features/editor/schema";
import { mdxToMarkdown } from "@/features/transfer/import/parsing/mdx";

test("keeps ESM statements, including ones spanning several lines, in an mdx block", () => {
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
  assert.equal(
    markdown,
    [
      "```mdx",
      'import { Callout } from "@/components/callout"',
      "export const meta = {",
      '  title: "Setup",',
      "}",
      "```",
      "",
      "# Setup",
    ].join("\n"),
  );
});

test("keeps component tags with their props and dedents the Markdown children", () => {
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
    [
      "```mdx",
      '<Callout type="warning">',
      "```",
      "",
      "**Careful** with this.",
      "",
      "- one",
      "  - nested",
      "",
      "```mdx",
      "</Callout>",
      "```",
      "",
      "After",
    ].join("\n"),
  );
});

test("keeps self-closing and multi-line component tags in one mdx block", () => {
  const markdown = mdxToMarkdown(
    ["Intro", "", "<Video", '  src="/demo.mp4"', "  autoplay", "/>", "", "Outro"].join("\n"),
  );
  assert.equal(
    markdown,
    [
      "Intro",
      "",
      "```mdx",
      "<Video",
      '  src="/demo.mp4"',
      "  autoplay",
      "/>",
      "```",
      "",
      "Outro",
    ].join("\n"),
  );
});

test("turns inline components, expressions and JSX comments into inline code", () => {
  assert.equal(
    mdxToMarkdown("Press <Kbd>Ctrl</Kbd> {/* hint */}to save, see `<Kbd>`. Total {props.count}."),
    "Press `<Kbd>`Ctrl`</Kbd>` `{/* hint */}`to save, see `<Kbd>`. Total `{props.count}`.",
  );
});

test("widens the fence around MDX that contains backticks", () => {
  assert.equal(
    mdxToMarkdown('<Code lang="ts" value={`a ``` b`} />'),
    ["````mdx", '<Code lang="ts" value={`a ``` b`} />', "````"].join("\n"),
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

test("converted MDX parses as structured Markdown with mdx code blocks", () => {
  const markdown = mdxToMarkdown(
    ['import { Tabs } from "x"', "", "<Tabs>", "  ## Heading", "", "  Body text", "</Tabs>"].join(
      "\n",
    ),
  );
  const document = parseProductMarkdown(markdown).toJSON();
  assert.deepEqual(
    document.content?.map((node) => node.type),
    ["code_block", "code_block", "heading", "paragraph", "code_block"],
  );
});
