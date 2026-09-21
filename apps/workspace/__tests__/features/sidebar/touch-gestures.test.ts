import assert from "node:assert/strict";
import test from "node:test";
import {
  SWIPE_DELETE_PX,
  SWIPE_MAX_PX,
  beginRowGesture,
  moveRowGesture,
  releaseIsTap,
  swipeDeletes,
  swipeOffset,
} from "../../../src/features/sidebar/touch-gestures";

test("a still finger keeps the long press armed and releases as a tap", () => {
  const gesture = moveRowGesture(beginRowGesture("n1", 100, 100), 104, 103);
  assert.equal(gesture.kind, "pending");
  assert.equal(releaseIsTap(gesture), true);
});

test("a vertical pull is a scroll and cancels the gesture", () => {
  const gesture = moveRowGesture(beginRowGesture("n1", 100, 100), 102, 130);
  assert.equal(gesture.kind, "cancelled");
  assert.equal(releaseIsTap(gesture), false);
});

test("a leftward pull becomes a swipe that deletes past the threshold", () => {
  let gesture = moveRowGesture(beginRowGesture("n1", 200, 100), 180, 102);
  assert.equal(gesture.kind, "swipe");
  assert.equal(swipeDeletes(gesture), false);
  gesture = moveRowGesture(gesture, 200 - SWIPE_DELETE_PX, 104);
  assert.equal(swipeDeletes(gesture), true);
  gesture = moveRowGesture(gesture, 200 - SWIPE_DELETE_PX + 30, 104);
  assert.equal(swipeDeletes(gesture), false);
});

test("a rightward pull is not a delete gesture", () => {
  assert.equal(moveRowGesture(beginRowGesture("n1", 100, 100), 140, 100).kind, "cancelled");
});

test("swipeOffset resists past the delete point and caps the travel", () => {
  assert.equal(swipeOffset(-40), -40);
  assert.equal(swipeOffset(-SWIPE_DELETE_PX), -SWIPE_DELETE_PX);
  assert.ok(swipeOffset(-SWIPE_DELETE_PX - 100) > -SWIPE_DELETE_PX - 100);
  assert.equal(swipeOffset(-10_000), -SWIPE_MAX_PX);
  assert.equal(swipeOffset(50), 0);
});
