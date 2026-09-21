import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RAIL_ITEMS } from "../../src/commands/rail-items";
import { TabBar } from "../../src/shell/tab-bar";

test("the tab bar lists every rail destination and marks the current one", () => {
  const html = renderToStaticMarkup(
    createElement(TabBar, { route: "journal", account: createElement("button", null, "Account") }),
  );
  for (const item of RAIL_ITEMS) {
    assert.match(html, new RegExp(`href="#/${item.route}"`));
    assert.match(html, new RegExp(`aria-label="${item.label}"`));
  }
  assert.equal(html.match(/aria-current="page"/g)?.length, 1);
  assert.match(html, /href="#\/journal"[^>]*aria-current="page"/);
  assert.match(html, /Account/);
});
