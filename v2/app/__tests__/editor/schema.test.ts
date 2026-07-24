import assert from "node:assert/strict";
import test from "node:test";
import { EditorState, TextSelection } from "prosemirror-state";
import {
  countWords,
  createProductPlugins,
  isDocEmpty,
  parseProductMarkdown,
  parseProductMarkdownWithImages,
  productSchema,
  serializeProductMarkdown,
  slashMenuState,
} from "../../src/editor/schema";

test("isDocEmpty detects single empty paragraph", () => {
  const emptyDoc = productSchema.node("doc", null, [productSchema.node("paragraph")]);
  assert.equal(isDocEmpty(emptyDoc), true);

  const nonEmptyDoc = productSchema.node("doc", null, [
    productSchema.node("paragraph", null, productSchema.text("Hello")),
  ]);
  assert.equal(isDocEmpty(nonEmptyDoc), false);

  const multiDoc = productSchema.node("doc", null, [
    productSchema.node("paragraph"),
    productSchema.node("paragraph"),
  ]);
  assert.equal(isDocEmpty(multiDoc), false);
});

test("countWords counts text descendant tokens", () => {
  const doc = productSchema.node("doc", null, [
    productSchema.node("paragraph", null, productSchema.text("Hello world  from Antigravity")),
    productSchema.node("heading", { level: 1 }, productSchema.text("Title Here")),
  ]);
  assert.equal(countWords(doc), 6);
});

test("serializeProductMarkdown and parseProductMarkdown roundtrip plain text", () => {
  const doc = productSchema.node("doc", null, [
    productSchema.node("paragraph", null, productSchema.text("Paragraph text")),
  ]);
  const markdown = serializeProductMarkdown(doc);
  assert.ok(markdown.includes("Paragraph text"));

  const parsed = parseProductMarkdown(markdown);
  assert.equal(countWords(parsed), 2);

  const emptyParsed = parseProductMarkdown("");
  assert.equal(isDocEmpty(emptyParsed), true);
});

test("parseProductMarkdownWithImages relinks known image ids back to image_ref", () => {
  const doc = productSchema.node("doc", null, [
    productSchema.node("paragraph", null, [
      productSchema.node("image_ref", { id: "img-1", alt: "A photo" }),
    ]),
  ]);
  const markdown = serializeProductMarkdown(doc);
  assert.ok(markdown.includes("images/img-1"));

  const relinked = parseProductMarkdownWithImages(markdown, new Set(["img-1"]));
  let sawImageRef = false;
  relinked.descendants((node) => {
    if (node.type.name === "image_ref") {
      sawImageRef = true;
      assert.equal(node.attrs.id, "img-1");
    }
    return true;
  });
  assert.ok(sawImageRef);

  const unrelinked = parseProductMarkdownWithImages(markdown, new Set());
  let sawPlainImage = false;
  unrelinked.descendants((node) => {
    if (node.type.name === "image") {
      sawPlainImage = true;
    }
    return true;
  });
  assert.ok(sawPlainImage);
});

test("createProductPlugins builds standard plugin set", () => {
  const plugins = createProductPlugins();
  assert.ok(plugins.length >= 6);
});

test("slashMenuState reflects slash command query", () => {
  const emptyDoc = productSchema.node("doc", null, [
    productSchema.node("paragraph", null, productSchema.text("/head")),
  ]);
  let state = EditorState.create({
    doc: emptyDoc,
    schema: productSchema,
    plugins: createProductPlugins(),
  });
  // Dispatch selection transaction to trigger slash menu plugin apply step
  const tr = state.tr.setSelection(TextSelection.create(state.doc, state.doc.content.size - 1));
  state = state.apply(tr);
  const menuState = slashMenuState(state);
  assert.equal(menuState.open, true);
  assert.equal(menuState.query, "head");
});
