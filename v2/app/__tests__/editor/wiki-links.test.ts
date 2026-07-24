import assert from "node:assert/strict";
import test from "node:test";
import {
  parseProductMarkdown,
  productSchema,
  serializeProductMarkdown,
} from "../../src/editor/schema";
import { extractReferences } from "../../src/references/extract";

test("serializeProductMarkdown exports note mentions as [[title]] and person mentions as $name", () => {
  const mentionRef = productSchema.nodes.mention_ref;
  assert.ok(mentionRef);

  const document = productSchema.node("doc", null, [
    productSchema.node("paragraph", null, [
      productSchema.text("link to "),
      mentionRef.create({ kind: "note", id: "note-123", label: "My Note Title" }),
      productSchema.text(" and "),
      mentionRef.create({ kind: "person", id: "person-456", label: "Alice" }),
    ]),
  ]);

  const serialized = serializeProductMarkdown(document);
  assert.equal(serialized, "link to [[My Note Title]] and $Alice");
});

test("parseProductMarkdown parses [[note title]] into note mention_ref nodes", () => {
  const markdown = "Reference to [[Architecture Plan]] in the doc.";
  const parsed = parseProductMarkdown(markdown);
  const references = extractReferences(parsed.toJSON());

  assert.equal(references.length, 1);
  assert.equal(references[0]?.kind, "note");
  assert.equal(references[0]?.targetId, "Architecture Plan");
});

test("parseProductMarkdown disambiguates standard Markdown links containing brackets from wiki links", () => {
  const markdown = "Check out [[link text]](https://example.com) for details.";
  const parsed = parseProductMarkdown(markdown);
  const references = extractReferences(parsed.toJSON());

  assert.equal(references.length, 0);
  assert.equal(serializeProductMarkdown(parsed).includes("https://example.com"), true);
});

test("markdown wiki-link serialization and parsing round-trips correctly", () => {
  const markdown = "See [[Target Note]] for more information.";
  const parsed = parseProductMarkdown(markdown);
  const reSerialized = serializeProductMarkdown(parsed);

  assert.equal(reSerialized, markdown);
});
