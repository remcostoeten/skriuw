import assert from "node:assert/strict";
import { test } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MobileSheet } from "@/shell/mobile-sheet";

function render(open: boolean): string {
  return renderToStaticMarkup(
    createElement(
      MobileSheet,
      { side: "left", open, label: "Notes", onClose: () => undefined },
      createElement("p", null, "tree"),
    ),
  );
}

test("an open sheet is a labelled modal dialog with a close control", () => {
  const html = render(true);
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /aria-label="Notes"/);
  assert.match(html, /aria-label="Close Notes"/);
  assert.match(html, /data-state="open"/);
  assert.match(html, /data-side="left"/);
  assert.match(html, /tree/);
});

test("a sheet that was never opened renders nothing", () => {
  assert.equal(render(false), "");
});
