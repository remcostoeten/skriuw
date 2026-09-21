import assert from "node:assert/strict";
import test from "node:test";
import { ANIMATED_GEOMETRY, GLYPHS, ICON_NAMES, ICON_REGISTRY } from "@skriuw/icons";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AnimatedIconsProvider } from "../../../src/shared/icons/animated-icons-context";
import { AppIcon } from "../../../src/shared/icons/app-icon";
import { RAIL_ICONS } from "../../../src/shell/rail-icons";

function render(name: (typeof ICON_NAMES)[number], animated: boolean): string {
  return renderToStaticMarkup(
    createElement(
      AnimatedIconsProvider,
      { enabled: animated },
      createElement(AppIcon, { name, size: 18 }),
    ),
  );
}

test("every action icon draws its 24-unit Fluent glyph at rest", () => {
  for (const name of ICON_NAMES) {
    const html = render(name, false);
    const glyph = GLYPHS[ICON_REGISTRY[name].glyph][24]!;
    assert.ok(html.includes(`data-motion-rest="" d="${glyph}"`), `${name}: rest glyph missing`);
    assert.match(html, /viewBox="0 0 24 24"/);
    assert.ok(
      !html.includes("data-motion-parts"),
      `${name}: parts rendered while animation is off`,
    );
  }
});

test("with animation on, the parts are mounted hidden next to the visible rest glyph", () => {
  for (const name of ICON_NAMES) {
    const entry = ICON_REGISTRY[name];
    const html = render(name, true);
    if (!("motion" in entry)) {
      assert.ok(!html.includes("data-motion-parts"), `${name}: has no motion but mounted parts`);
      continue;
    }
    assert.match(html, /data-motion-parts="" visibility="hidden"/);
    for (const part of ANIMATED_GEOMETRY[entry.motion].parts) {
      assert.ok(html.includes(`data-motion-part="${part.id}"`), `${name}: part ${part.id} missing`);
    }
  }
});

test("clip, window and mask ids are unique per icon instance", () => {
  const html = renderToStaticMarkup(
    createElement(
      AnimatedIconsProvider,
      { enabled: true },
      createElement(AppIcon, { name: "notes" }),
      createElement(AppIcon, { name: "notes" }),
    ),
  );
  const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(ids.length > 0);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id!, /^[a-zA-Z0-9-]+$/);
});

test("the rail's destinations are all animated action icons", () => {
  for (const name of Object.values(RAIL_ICONS)) {
    assert.ok("motion" in ICON_REGISTRY[name], `${name}: rail icon without motion`);
  }
});
