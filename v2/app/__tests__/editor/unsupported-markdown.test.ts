import assert from "node:assert/strict";
import test from "node:test";
import {
  hasLosslessMarkdownDocument,
  parseProductMarkdown,
  requiresLosslessMarkdownSource,
  serializeProductMarkdown,
} from "../../src/editor/schema";
import { buildRestoreDocument } from "../../src/history/version-model";

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
