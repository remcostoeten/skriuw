import assert from "node:assert/strict";
import test from "node:test";
import {
  mediaTitleFromSource,
  parseProductMarkdown,
  productSchema,
  serializeProductMarkdown,
} from "../../../src/features/editor/schema";

function paragraph(text: string) {
  return productSchema.node("paragraph", null, text ? [productSchema.text(text)] : []);
}

function toggleHeadingDocument(level: number) {
  return productSchema.node("doc", null, [
    productSchema.node("toggle_list", null, [
      productSchema.node("toggle_item", { open: true }, [
        productSchema.node("heading", { level }, [productSchema.text("Roadmap")]),
        paragraph("Body detail"),
      ]),
    ]),
  ]);
}

test("a toggle heading survives a Markdown round trip", () => {
  const markdown = serializeProductMarkdown(toggleHeadingDocument(2));
  assert.match(markdown, /skriuw-toggle-heading:2/);
  assert.match(markdown, /\[v\] Roadmap/);

  const parsed = parseProductMarkdown(markdown);
  const item = parsed.firstChild?.firstChild;
  assert.equal(item?.type.name, "toggle_item");
  assert.equal(item?.attrs.open, true);
  const summary = item?.firstChild;
  assert.equal(summary?.type.name, "heading");
  assert.equal(summary?.attrs.level, 2);
  assert.equal(summary?.textContent, "Roadmap");
  assert.equal(item?.child(1).textContent, "Body detail");
});

test("a plain toggle summary stays a paragraph", () => {
  const document = productSchema.node("doc", null, [
    productSchema.node("toggle_list", null, [
      productSchema.node("toggle_item", { open: false }, [paragraph("Closed item")]),
    ]),
  ]);
  const markdown = serializeProductMarkdown(document);
  assert.doesNotMatch(markdown, /skriuw-toggle-heading/);

  const summary = parseProductMarkdown(markdown).firstChild?.firstChild?.firstChild;
  assert.equal(summary?.type.name, "paragraph");
  assert.equal(summary?.textContent, "Closed item");
});

test("media embeds serialize as a link plus a kind marker", () => {
  for (const kind of ["video", "audio", "file"] as const) {
    const document = productSchema.node("doc", null, [
      productSchema.node("media", { kind, src: "https://example.com/clip.mp4", title: "Clip" }),
    ]);
    const markdown = serializeProductMarkdown(document);
    assert.equal(markdown.trim(), `[Clip](https://example.com/clip.mp4)<!--skriuw-media:${kind}-->`);

    const parsed = parseProductMarkdown(markdown).firstChild;
    assert.equal(parsed?.type.name, "media");
    assert.equal(parsed?.attrs.kind, kind);
    assert.equal(parsed?.attrs.src, "https://example.com/clip.mp4");
    assert.equal(parsed?.attrs.title, "Clip");
  }
});

test("an unfilled media embed round trips as an empty placeholder", () => {
  const document = productSchema.node("doc", null, [
    productSchema.node("media", { kind: "audio", src: "", title: "" }),
  ]);
  const markdown = serializeProductMarkdown(document);
  assert.equal(markdown.trim(), "<!--skriuw-media:audio-->");

  const parsed = parseProductMarkdown(markdown).firstChild;
  assert.equal(parsed?.type.name, "media");
  assert.equal(parsed?.attrs.kind, "audio");
  assert.equal(parsed?.attrs.src, "");
});

test("a stored video round trips through its refId", () => {
  const document = productSchema.node("doc", null, [
    productSchema.node("media", {
      kind: "video",
      src: "",
      title: "clip.mp4",
      refId: "0d9f6c1e-aaaa-bbbb-cccc-111122223333",
    }),
  ]);
  const markdown = serializeProductMarkdown(document);
  assert.equal(
    markdown.trim(),
    "[clip.mp4](images/0d9f6c1e-aaaa-bbbb-cccc-111122223333)<!--skriuw-media:video-->",
  );

  const parsed = parseProductMarkdown(markdown).firstChild;
  assert.equal(parsed?.type.name, "media");
  assert.equal(parsed?.attrs.kind, "video");
  assert.equal(parsed?.attrs.refId, "0d9f6c1e-aaaa-bbbb-cccc-111122223333");
  assert.equal(parsed?.attrs.src, "");
  assert.equal(parsed?.attrs.title, "clip.mp4");
});

test("an exported media path with an extension stays a plain source", () => {
  const parsed = parseProductMarkdown(
    "[clip.mp4](images/abc123.mp4)<!--skriuw-media:video-->",
  ).firstChild;
  assert.equal(parsed?.type.name, "media");
  assert.equal(parsed?.attrs.refId, "");
  assert.equal(parsed?.attrs.src, "images/abc123.mp4");
});

test("an ordinary link paragraph is left alone", () => {
  const parsed = parseProductMarkdown("[Docs](https://example.com/docs)");
  assert.equal(parsed.firstChild?.type.name, "paragraph");
});

test("mediaTitleFromSource reads the file name out of a URL", () => {
  assert.equal(mediaTitleFromSource("https://example.com/files/report%20v2.pdf"), "report v2.pdf");
  assert.equal(mediaTitleFromSource("https://example.com/clip.mp4?t=30"), "clip.mp4");
  assert.equal(mediaTitleFromSource(""), "");
});
