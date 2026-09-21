import assert from "node:assert/strict";
import test from "node:test";
import { GLYPH_NAMES } from "./catalog";
import { ANIMATED_GEOMETRY } from "./generated/animated";
import { GLYPHS } from "./generated/glyphs";
import { ICON_MOTIONS } from "./motion";
import { ICON_NAMES, ICON_REGISTRY } from "./registry";
import { selectGlyph } from "./select";

test("every registry name resolves to a 24-unit glyph both platforms can draw", () => {
  for (const name of ICON_NAMES) {
    const entry = ICON_REGISTRY[name];
    assert.ok(GLYPHS[entry.glyph][24], `${name}: ${entry.glyph} has no 24-unit drawing`);
  }
});

test("an animated registry entry animates the glyph it shows at rest", () => {
  for (const name of ICON_NAMES) {
    const entry = ICON_REGISTRY[name];
    if (!("motion" in entry)) continue;
    assert.equal(ANIMATED_GEOMETRY[entry.motion].glyph, entry.glyph, `${name}: motion is drawn on another glyph`);
    assert.ok(ICON_MOTIONS[entry.motion], `${name}: no motion "${entry.motion}"`);
  }
});

test("notes is the open folder, the same glyph as the rail", () => {
  assert.equal(ICON_REGISTRY.notes.glyph, "folder_open");
  assert.equal(ANIMATED_GEOMETRY.notes.glyph, "folder_open");
});

test("every cataloged glyph has data and small sizes prefer the 20-unit drawing", () => {
  for (const name of GLYPH_NAMES) {
    assert.ok(GLYPHS[name][20] ?? GLYPHS[name][24], `${name}: no drawing`);
  }
  assert.equal(selectGlyph("folder", 16).grid, 20);
  assert.equal(selectGlyph("folder", 28).grid, 24);
  assert.equal(selectGlyph("folder", 16, 24).grid, 24);
  assert.equal(selectGlyph("text_whole_word", 32).grid, 20, "falls back to the only drawing Fluent has");
});
