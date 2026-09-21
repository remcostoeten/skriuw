import assert from "node:assert/strict";
import test from "node:test";
import { GLYPHS } from "@skriuw/icons";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { glyphMarkup } from "../../../src/shared/icons/markup";
import { FolderOpenIcon, LockIcon, SkriuwLogo, TagsIcon } from "../../../src/shared/icons/static";

test("static icons draw Fluent fills, hidden from assistive technology by default", () => {
  const html = renderToStaticMarkup(createElement(FolderOpenIcon, { size: 16 }));
  assert.match(html, /viewBox="0 0 20 20"/);
  assert.match(html, /fill="currentColor"/);
  assert.match(html, /aria-hidden="true"/);
  assert.ok(html.includes(GLYPHS.folder_open[20]!));
  assert.ok(!html.includes("stroke"), "no stroke-based drawing remains");
});

test("large renders use the 24-unit drawing", () => {
  const html = renderToStaticMarkup(createElement(LockIcon, { size: 40 }));
  assert.match(html, /viewBox="0 0 24 24"/);
  assert.ok(html.includes(GLYPHS.lock_closed[24]!));
});

test("a labelled icon is exposed as an image", () => {
  const html = renderToStaticMarkup(createElement(TagsIcon, { "aria-label": "Tags" }));
  assert.match(html, /role="img"/);
  assert.doesNotMatch(html, /aria-hidden/);
});

test("the brand mark is not a Fluent glyph and keeps its own grid", () => {
  assert.match(renderToStaticMarkup(createElement(SkriuwLogo)), /viewBox="0 0 40 40"/);
});

test("markup for non-React DOM carries the same glyph", () => {
  const markup = glyphMarkup("add", 14);
  assert.match(markup, /width="14" height="14"/);
  assert.ok(markup.includes(GLYPHS.add[20]!));
  assert.doesNotMatch(glyphMarkup("play"), /width=/);
});
