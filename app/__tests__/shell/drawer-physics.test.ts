import assert from "node:assert/strict";
import test from "node:test";
import {
  classifySwipe,
  drawerProgress,
  drawerTranslate,
  openingDelta,
  pickDrawer,
  pushSample,
  releaseVelocity,
  resolveDrawerSettle,
  rubberBand,
} from "../../src/shell/drawer-physics";

test("rubber band follows the finger at first and saturates below the dimension", () => {
  assert.equal(rubberBand(0, 300), 0);
  assert.equal(rubberBand(-20, 300), 0);
  const small = rubberBand(10, 300);
  assert.ok(small > 5 && small < 6, `expected roughly half-speed start, got ${small}`);
  const huge = rubberBand(5000, 300);
  assert.ok(huge < 300, `expected stretch under 300, got ${huge}`);
  assert.ok(rubberBand(200, 300) < rubberBand(400, 300));
});

test("drawer progress tracks the finger between closed and open", () => {
  assert.equal(drawerProgress(0, 120, 300), 120);
  assert.equal(drawerProgress(300, -80, 300), 220);
  assert.equal(drawerProgress(0, -40, 300), 0);
});

test("drawer progress overstretches past open with resistance", () => {
  const stretched = drawerProgress(300, 100, 300);
  assert.ok(stretched > 300 && stretched < 400, `got ${stretched}`);
  assert.ok(drawerProgress(300, 1000, 300) < 600);
});

test("swipe intent needs travel and a clear axis", () => {
  assert.equal(classifySwipe(4, 3), "undecided");
  assert.equal(classifySwipe(14, 2), "horizontal");
  assert.equal(classifySwipe(-14, 2), "horizontal");
  assert.equal(classifySwipe(6, 14), "vertical");
  assert.equal(classifySwipe(12, 11), "vertical");
});

test("an open drawer owns the gesture, otherwise direction picks the drawer", () => {
  const closed = { sidebarOpen: false, metadataOpen: false, hasSidebar: true, hasMetadata: true };
  assert.equal(pickDrawer(20, closed), "sidebar");
  assert.equal(pickDrawer(-20, closed), "metadata");
  assert.equal(pickDrawer(-20, { ...closed, hasMetadata: false }), null);
  assert.equal(pickDrawer(20, { ...closed, hasSidebar: false }), null);
  assert.equal(pickDrawer(20, { ...closed, sidebarOpen: true }), "sidebar");
  assert.equal(pickDrawer(-20, { ...closed, sidebarOpen: true }), "sidebar");
  assert.equal(pickDrawer(20, { ...closed, metadataOpen: true }), "metadata");
});

test("opening delta and translate mirror for the right-hand drawer", () => {
  assert.equal(openingDelta("left", 30), 30);
  assert.equal(openingDelta("right", 30), -30);
  assert.equal(drawerTranslate("left", 0, 300), -300);
  assert.equal(drawerTranslate("left", 300, 300), 0);
  assert.equal(drawerTranslate("right", 0, 240), 240);
  assert.equal(drawerTranslate("right", 240, 240), 0);
});

test("release velocity uses only the trailing window", () => {
  let samples = pushSample([], { x: 0, time: 0 });
  samples = pushSample(samples, { x: 200, time: 50 });
  samples = pushSample(samples, { x: 200, time: 300 });
  samples = pushSample(samples, { x: 200, time: 340 });
  assert.equal(releaseVelocity(samples), 0);
  samples = pushSample(samples, { x: 260, time: 380 });
  assert.equal(releaseVelocity(samples), 60 / 80);
  assert.equal(releaseVelocity([]), 0);
});

test("a flick wins over position, a slow release lands on the nearer side", () => {
  assert.equal(resolveDrawerSettle(40, 300, 0.6), true);
  assert.equal(resolveDrawerSettle(260, 300, -0.6), false);
  assert.equal(resolveDrawerSettle(140, 300, 0.1), false);
  assert.equal(resolveDrawerSettle(160, 300, -0.1), true);
});
