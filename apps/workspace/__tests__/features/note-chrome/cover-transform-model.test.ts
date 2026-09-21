import assert from "node:assert/strict";
import test from "node:test";
import {
  applyCoverFocalPreset,
  COVER_FOCAL_PRESETS,
  coverTransformForKey,
  type CoverTransform,
} from "../../../src/features/note-chrome/cover-transform-model";

const centered: CoverTransform = {
  positionX: 50,
  positionY: 50,
  zoom: 1.5,
};

test("focal presets cover a three-by-three grid", () => {
  assert.equal(COVER_FOCAL_PRESETS.length, 9);
  assert.deepEqual(
    COVER_FOCAL_PRESETS.map(({ positionX, positionY }) => [positionX, positionY]),
    [
      [0, 0],
      [50, 0],
      [100, 0],
      [0, 50],
      [50, 50],
      [100, 50],
      [0, 100],
      [50, 100],
      [100, 100],
    ],
  );
});

test("applying a focal preset preserves zoom", () => {
  assert.deepEqual(applyCoverFocalPreset(centered, "bottom-right"), {
    positionX: 100,
    positionY: 100,
    zoom: 1.5,
  });
  assert.equal(applyCoverFocalPreset(centered, "center"), centered);
});

test("arrow keys pan with normal and larger Shift steps", () => {
  assert.deepEqual(coverTransformForKey(centered, "ArrowLeft"), {
    positionX: 48,
    positionY: 50,
    zoom: 1.5,
  });
  assert.deepEqual(coverTransformForKey(centered, "ArrowDown", { shiftKey: true }), {
    positionX: 50,
    positionY: 60,
    zoom: 1.5,
  });
});

test("pan and zoom remain inside their bounds", () => {
  const limits: CoverTransform = { positionX: 0, positionY: 100, zoom: 3 };
  assert.equal(coverTransformForKey(limits, "ArrowLeft"), limits);
  assert.equal(coverTransformForKey(limits, "ArrowDown"), limits);
  assert.equal(coverTransformForKey(limits, "+"), limits);

  assert.deepEqual(
    coverTransformForKey(
      { positionX: 50, positionY: 50, zoom: 1.9 },
      "+",
      { shiftKey: true, maxZoom: 2 },
    ),
    { positionX: 50, positionY: 50, zoom: 2 },
  );
  const minimum: CoverTransform = { positionX: 50, positionY: 50, zoom: 1 };
  assert.equal(coverTransformForKey(minimum, "-"), minimum);
});

test("plus and minus keys zoom with normal and larger Shift steps", () => {
  assert.deepEqual(coverTransformForKey(centered, "+"), {
    positionX: 50,
    positionY: 50,
    zoom: 1.6,
  });
  assert.deepEqual(coverTransformForKey(centered, "-", { shiftKey: true }), {
    positionX: 50,
    positionY: 50,
    zoom: 1.25,
  });
});

test("Home resets while unrelated keys return null", () => {
  assert.deepEqual(coverTransformForKey(centered, "Home"), {
    positionX: 50,
    positionY: 50,
    zoom: 1,
  });
  assert.equal(coverTransformForKey(centered, "Escape"), null);

  const reset: CoverTransform = { positionX: 50, positionY: 50, zoom: 1 };
  assert.equal(coverTransformForKey(reset, "Home"), reset);
});
