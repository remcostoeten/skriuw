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
} from "../../../src/features/editor/schema";

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

test("Mermaid flowchart fences become durable diagram blocks", () => {
  const markdown = `Before

\`\`\`mermaid
flowchart LR
  first["First"] --> second{"Second?"}
\`\`\`

After`;
  const document = parseProductMarkdown(markdown);
  const diagram = document.child(1);
  assert.equal(diagram.type.name, "diagram");
  assert.equal(diagram.attrs.model.nodes[0]?.label, "First");
  assert.match(serializeProductMarkdown(document), /```mermaid\nflowchart LR/);
  assert.deepEqual(
    parseProductMarkdown(serializeProductMarkdown(document)).toJSON(),
    document.toJSON(),
  );
  assert.equal(countWords(document), 4);
});

test("unsupported Mermaid remains editable source instead of losing content", () => {
  const document = parseProductMarkdown(`\`\`\`mermaid
sequenceDiagram
  A->>B: Hello
\`\`\``);
  assert.equal(document.firstChild?.type.name, "code_block");
  assert.equal(document.firstChild?.attrs.params, "mermaid");
  assert.match(document.firstChild?.textContent ?? "", /sequenceDiagram/);
});

test("raw Mermaid edits retain positions for stable node ids", () => {
  const before = parseProductMarkdown(`\`\`\`mermaid
flowchart LR
  first["First"] --> second["Second"]
\`\`\``);
  const previousJson = before.toJSON() as any;
  previousJson.content[0].attrs.model.nodes[1].position = { x: 713, y: 191 };
  const after = parseProductMarkdownWithImages(`\`\`\`mermaid
flowchart TD
  first["First"] --> second["Renamed"]
\`\`\``, new Set(), previousJson);
  const second = after.firstChild?.attrs.model.nodes.find(({ id }: { id: string }) => id === "second");
  assert.deepEqual(second?.position, { x: 713, y: 191 });
  assert.equal(second?.label, "Renamed");
});

test("rich formatting survives JSON, DOM specs, and Markdown roundtrips", () => {
  const underline = productSchema.marks.underline;
  const highlight = productSchema.marks.highlight;
  assert.ok(underline);
  assert.ok(highlight);
  const document = productSchema.node("doc", null, [
    productSchema.node("heading", { level: 2, textAlign: "right" }, [
      productSchema.text("Title"),
    ]),
    productSchema.node("paragraph", { textAlign: "center" }, [
      productSchema.text("Marked", [
        underline.create(),
        highlight.create({ color: "blue" }),
      ]),
    ]),
  ]);

  assert.deepEqual(productSchema.nodeFromJSON(document.toJSON()).toJSON(), document.toJSON());
  const markdown = serializeProductMarkdown(document);
  assert.match(markdown, /<!--skriuw-align:right-->/);
  assert.match(markdown, /<!--skriuw-align:center-->/);
  assert.match(markdown, /<u><mark data-skriuw-highlight="blue">Marked<\/mark><\/u>/);
  assert.deepEqual(parseProductMarkdown(markdown).toJSON(), document.toJSON());

  const paragraphToDom = productSchema.nodes.paragraph?.spec.toDOM;
  assert.equal(typeof paragraphToDom, "function");
  assert.deepEqual(
    paragraphToDom?.(productSchema.node("paragraph", { textAlign: "center" })),
    ["p", { "data-text-align": "center", style: "text-align: center" }, 0],
  );
  const paragraphRule = productSchema.nodes.paragraph?.spec.parseDOM?.[0];
  assert.ok(paragraphRule && "getAttrs" in paragraphRule && paragraphRule.getAttrs);
  const parsedParagraph = paragraphRule.getAttrs?.({
    getAttribute: (name: string) => name === "data-text-align" ? "center" : null,
    style: { textAlign: "" },
  } as unknown as HTMLElement);
  assert.deepEqual(parsedParagraph, { textAlign: "center" });

  const highlightRule = productSchema.marks.highlight?.spec.parseDOM?.[0];
  assert.ok(highlightRule && "getAttrs" in highlightRule && highlightRule.getAttrs);
  const parsedHighlight = highlightRule.getAttrs?.({
    getAttribute: (name: string) => name === "data-skriuw-highlight" ? "blue" : null,
  } as unknown as HTMLElement);
  assert.deepEqual(parsedHighlight, { color: "blue" });
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

test("plain Markdown images render as blocked placeholders without a src attribute", () => {
  const document = parseProductMarkdown("![Remote](https://example.com/image.png)");
  const image = document.firstChild?.firstChild;
  assert.equal(image?.type.name, "image");
  const rendered = productSchema.nodes.image?.spec.toDOM?.(image!);
  assert.ok(Array.isArray(rendered));
  assert.equal(rendered[0], "span");
  assert.equal("src" in (rendered[1] as Record<string, unknown>), false);
  assert.equal(
    serializeProductMarkdown(document),
    "![Remote](https://example.com/image.png)",
  );
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
