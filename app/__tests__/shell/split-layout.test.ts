import assert from "node:assert/strict";
import test from "node:test";
import {
  ratioAtPointer,
  splitGridTemplate,
  splitTrackProperty,
} from "../../src/shell/split-layout";
import {
  DEFAULT_SPLIT_RATIO,
  MAX_SPLIT_RATIO,
  MIN_SPLIT_RATIO,
} from "../../src/store/panes";

test("split tracks give the ratio to the panes and a fixed track to the divider", () => {
  assert.equal(splitGridTemplate(0.5), "minmax(0, 0.5fr) 1px minmax(0, 0.5fr)");
  assert.equal(splitGridTemplate(0.25), "minmax(0, 0.25fr) 1px minmax(0, 0.75fr)");
});

test("split tracks clamp out-of-range ratios instead of collapsing a pane", () => {
  assert.equal(
    splitGridTemplate(0),
    `minmax(0, ${MIN_SPLIT_RATIO}fr) 1px minmax(0, ${1 - MIN_SPLIT_RATIO}fr)`,
  );
  assert.equal(
    splitGridTemplate(1),
    `minmax(0, ${MAX_SPLIT_RATIO}fr) 1px minmax(0, ${1 - MAX_SPLIT_RATIO}fr)`,
  );
});

test("orientation picks the axis the ratio is written to", () => {
  assert.equal(splitTrackProperty("vertical"), "gridTemplateColumns");
  assert.equal(splitTrackProperty("horizontal"), "gridTemplateRows");
});

test("pointer position maps to a ratio of the container extent", () => {
  assert.equal(ratioAtPointer(500, 200, 800), 0.375);
  assert.equal(ratioAtPointer(200, 200, 800), MIN_SPLIT_RATIO);
  assert.equal(ratioAtPointer(1000, 200, 800), MAX_SPLIT_RATIO);
});

test("an unlaid-out container falls back to the default ratio", () => {
  assert.equal(ratioAtPointer(200, 200, 0), DEFAULT_SPLIT_RATIO);
});
