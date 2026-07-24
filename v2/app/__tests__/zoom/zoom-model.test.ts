import assert from "node:assert/strict";
import test from "node:test";
import {
  ZOOM_DEFAULT_PERCENT,
  ZOOM_MAX_PERCENT,
  ZOOM_MIN_PERCENT,
  clampZoomPercent,
  parseStoredZoomPercent,
} from "../../src/zoom/zoom-model";

test("clampZoomPercent keeps values inside the zoom range and rounds", () => {
  assert.equal(clampZoomPercent(100), 100);
  assert.equal(clampZoomPercent(104.6), 105);
  assert.equal(clampZoomPercent(1), ZOOM_MIN_PERCENT);
  assert.equal(clampZoomPercent(9000), ZOOM_MAX_PERCENT);
  assert.equal(clampZoomPercent(Number.NaN), ZOOM_DEFAULT_PERCENT);
  assert.equal(clampZoomPercent(Number.POSITIVE_INFINITY), ZOOM_DEFAULT_PERCENT);
});

test("parseStoredZoomPercent restores valid values and defaults on junk", () => {
  assert.equal(parseStoredZoomPercent("125"), 125);
  assert.equal(parseStoredZoomPercent("9000"), ZOOM_MAX_PERCENT);
  assert.equal(parseStoredZoomPercent(null), ZOOM_DEFAULT_PERCENT);
  assert.equal(parseStoredZoomPercent("banana"), ZOOM_DEFAULT_PERCENT);
  assert.equal(parseStoredZoomPercent(""), ZOOM_DEFAULT_PERCENT);
});
