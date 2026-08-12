import assert from "node:assert/strict";
import test from "node:test";
import {
  hasLosslessMarkdownDocument,
  parseProductMarkdown,
  requiresLosslessMarkdownSource,
  serializeProductMarkdown,
} from "../../../src/features/editor/schema";
import { planMarkdownImport } from "../../../src/features/transfer/export/markdown-transfer-model";
import { buildRestoreDocument } from "../../../src/features/history/version-model";

const frontmatter = "---\ntitle: Exact\naliases:\n  - one\n---\n\n# Body\n";
const footnotes = "Text with a note[^source].\n\n[^source]: Exact source.\n";

test("frontmatter remains exact opaque source", () => {
  const document = parseProductMarkdown(frontmatter);

  assert.equal(requiresLosslessMarkdownSource(frontmatter), true);
  assert.equal(hasLosslessMarkdownDocument(document.toJSON()), true);
  assert.equal(serializeProductMarkdown(document), frontmatter);
});

test("footnotes remain exact opaque source", () => {
  const document = parseProductMarkdown(footnotes);

  assert.equal(requiresLosslessMarkdownSource(footnotes), true);
  assert.equal(hasLosslessMarkdownDocument(document.toJSON()), true);
  assert.equal(serializeProductMarkdown(document), footnotes);
});

test("history restore keeps unsupported Markdown byte-for-byte", () => {
  const restored = buildRestoreDocument(frontmatter);

  assert.equal(restored.markdown, frontmatter);
  assert.equal(hasLosslessMarkdownDocument(restored.documentJson), true);
});

test("Markdown import reports notes preserved in raw mode", () => {
  const plan = planMarkdownImport(
    {
      directories: [],
      files: [{ relativePath: "Exact.md", content: footnotes }],
      skipped: 0,
    },
    1,
    () => "note-1",
  );

  assert.equal(plan.preservedSources, 1);
  assert.equal(
    plan.contentOperations[0]?.type === "save_document"
      ? plan.contentOperations[0].markdown
      : null,
    footnotes,
  );
});
