import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "vitest";
import { Fragment, type Node as ProseMirrorNode } from "prosemirror-model";
import {
  countWords,
  parseProductMarkdown,
  productSchema,
  serializeProductMarkdown,
} from "@/features/editor/schema";
import { promotedChecklistTaskLinks } from "@/features/editor/tasks/promotion";

const FIXTURE_ROOT = join(process.cwd(), "__tests__/fixtures");

const REPRESENTATIVE = `# Release notes

Intro paragraph with **bold**, *em*, \`code\`, [a link](https://example.com) and example.com.

- tight one
- tight two
- tight three

- loose one

- loose two

1. first
2. second
3. third

10. tenth
11. eleventh

- [ ] open task <!--skriuw-task:task-a:block-a-->
- [x] done task <!--skriuw-task:task-b:block-b-->
- [ ] plain check item

- [v] Open toggle
  - nested child
- [>] Closed toggle

> A quote that spans
> two lines

\`\`\`ts
const answer = 42;
\`\`\`

\`\`\`mermaid
flowchart TD
  A[Start] --> B[Finish]
\`\`\`

$$
x^2 + y^2 = z^2
$$

Inline $e = mc^2$ math and a literal \\$5 price.

| Name | Value |
| --- | --- |
| alpha | **1** |
| beta | 2 |

Line one  
line two

***

## Trailing section

Wow! [link right after a bang](https://example.com)

<mark data-skriuw-highlight="yellow">highlighted</mark> and <u>underlined</u> text.

### Last heading`;

function markdownFixtures(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) found.push(...markdownFixtures(path));
    else if (entry.endsWith(".md")) found.push(readFileSync(path, "utf8"));
  }
  return found;
}

function fresh(document: ProseMirrorNode): ProseMirrorNode {
  return productSchema.nodeFromJSON(document.toJSON());
}

function withBlocks(
  document: ProseMirrorNode,
  blocks: readonly ProseMirrorNode[],
): ProseMirrorNode {
  const content = blocks.length > 0 ? blocks : [productSchema.node("paragraph")];
  return document.copy(Fragment.fromArray([...content]));
}

function blocksOf(document: ProseMirrorNode): ProseMirrorNode[] {
  const blocks: ProseMirrorNode[] = [];
  document.forEach((block) => blocks.push(block));
  return blocks;
}

function rearrangements(document: ProseMirrorNode): ProseMirrorNode[] {
  const blocks = blocksOf(document);
  const empty = productSchema.node("paragraph");
  const variants: ProseMirrorNode[] = [];
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]!;
    const without = blocks.filter((_, other) => other !== index);
    variants.push(withBlocks(document, without));
    variants.push(withBlocks(document, [...without, block]));
    variants.push(withBlocks(document, [block, ...without]));
    variants.push(
      withBlocks(document, [...blocks.slice(0, index + 1), block, ...blocks.slice(index + 1)]),
    );
    variants.push(withBlocks(document, [...blocks.slice(0, index), empty, ...blocks.slice(index)]));
    if (index + 1 < blocks.length) {
      const swapped = [...blocks];
      swapped[index] = blocks[index + 1]!;
      swapped[index + 1] = block;
      variants.push(withBlocks(document, swapped));
    }
  }
  return variants;
}

function assertCacheTransparent(document: ProseMirrorNode, label: string): void {
  const cold = serializeProductMarkdown(fresh(document));
  assert.equal(serializeProductMarkdown(document), cold, `${label}: first serialization`);
  assert.equal(serializeProductMarkdown(document), cold, `${label}: cached serialization`);
  assert.equal(countWords(document), countWords(fresh(document)), `${label}: word count`);
  assert.deepEqual(
    promotedChecklistTaskLinks(document, "note-1", 7),
    promotedChecklistTaskLinks(fresh(document), "note-1", 7),
    `${label}: task links`,
  );
}

test("a representative document serializes identically through the block cache", () => {
  const document = parseProductMarkdown(REPRESENTATIVE);
  assert.ok(document.childCount > 15);
  assertCacheTransparent(document, "representative");
  for (const [index, variant] of rearrangements(document).entries()) {
    assertCacheTransparent(variant, `representative variant ${index}`);
  }
});

test("adjacent lists of one type keep their separating blank lines when cached", () => {
  const list = productSchema.node("bullet_list", null, [
    productSchema.node("list_item", null, [
      productSchema.node("paragraph", null, [productSchema.text("item")]),
    ]),
  ]);
  const paragraph = productSchema.node("paragraph", null, [productSchema.text("between")]);
  const apart = productSchema.node("doc", null, [list, paragraph, list]);
  const together = productSchema.node("doc", null, [list, list]);
  assertCacheTransparent(apart, "apart");
  assertCacheTransparent(together, "together");
  assert.notEqual(serializeProductMarkdown(together), serializeProductMarkdown(fresh(apart)));
});

test("every Markdown fixture serializes identically through the block cache", () => {
  const fixtures = markdownFixtures(FIXTURE_ROOT);
  assert.ok(fixtures.length > 0);
  for (const [index, markdown] of fixtures.entries()) {
    const document = parseProductMarkdown(markdown);
    assertCacheTransparent(document, `fixture ${index}`);
    for (const [variantIndex, variant] of rearrangements(document).slice(0, 60).entries()) {
      assertCacheTransparent(variant, `fixture ${index} variant ${variantIndex}`);
    }
  }
}, 30_000);

test("an edited block is re-serialized while its neighbours are replayed", () => {
  const document = parseProductMarkdown("# Title\n\nFirst paragraph\n\nSecond paragraph");
  serializeProductMarkdown(document);
  const edited = document.copy(
    document.content.replaceChild(
      1,
      productSchema.node("paragraph", null, [productSchema.text("First paragraph, edited")]),
    ),
  );
  assert.equal(
    serializeProductMarkdown(edited),
    "# Title\nFirst paragraph, edited\n\nSecond paragraph",
  );
  assert.equal(countWords(edited), 6);
});

test("a drawing layer still trails the cached body", () => {
  const document = parseProductMarkdown("Body text");
  const drawn = productSchema.node(
    "doc",
    { ...document.attrs, drawing: { version: 1, elements: [] } },
    blocksOf(document),
  );
  assertCacheTransparent(drawn, "drawing");
});
