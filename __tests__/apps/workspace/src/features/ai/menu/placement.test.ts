import assert from "node:assert/strict";
import { test } from "vitest";
import { placeAiMenu, type AiMenuGeometry, type Box } from "@/features/ai/menu/placement";

const SIZE = { width: 380, height: 300 };
const NATURAL = 500;
const VIEWPORT: Box = { top: 0, bottom: 1000, left: 0, right: 1400 };
const PANE: Box = { top: 40, bottom: 1000, left: 200, right: 1400 };
const COLUMN: Box = { top: -2000, bottom: 4000, left: 400, right: 1200 };

function caret(left: number, top: number): Box {
  return { left, right: left, top, bottom: top + 20 };
}

function geometry(start: Box, end: Box = start): AiMenuGeometry {
  return { start, end, column: COLUMN, bounds: PANE, viewport: VIEWPORT };
}

test("a caret with no selection centers the menu on the text column", () => {
  const placement = placeAiMenu(geometry(caret(410, 600)), false, SIZE, NATURAL);
  assert.equal(placement.left, 800 - SIZE.width / 2);
});

test("a single-line selection centers the menu on the selection", () => {
  const placement = placeAiMenu(geometry(caret(500, 600), caret(700, 600)), true, SIZE, NATURAL);
  assert.equal(placement.left, 600 - SIZE.width / 2);
  assert.equal(placement.below, false);
  assert.equal(placement.top, 600 - 10 - SIZE.height);
});

test("a range near the top of the pane opens below it", () => {
  const placement = placeAiMenu(geometry(caret(500, 80)), false, SIZE, NATURAL);
  assert.equal(placement.below, true);
  assert.equal(placement.top, 100 + 10);
});

test("a range scrolled above the pane pins the menu to the pane top", () => {
  const placement = placeAiMenu(geometry(caret(500, -1500)), false, SIZE, NATURAL);
  assert.equal(placement.top, PANE.top + 12);
  assert.equal(placement.room, PANE.bottom - PANE.top - 24);
});

test("a range scrolled below the pane pins the menu to the pane bottom", () => {
  const placement = placeAiMenu(geometry(caret(500, 3000)), false, SIZE, NATURAL);
  assert.equal(placement.top, PANE.bottom - 12 - SIZE.height);
});

test("a selection taller than the pane keeps the menu on screen", () => {
  const placement = placeAiMenu(geometry(caret(410, -800), caret(900, 2600)), true, SIZE, NATURAL);
  assert.ok(placement.top >= PANE.top + 12);
  assert.ok(placement.top + SIZE.height <= PANE.bottom - 12);
});
