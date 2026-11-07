import assert from "node:assert/strict";
import { test } from "vitest";
import { appRouteHash, resolveAppRoute } from "@skriuw/renderer-core/route/app-route";
import { THEME_NAMES } from "@skriuw/theme";
import {
  SHELL_DESTINATIONS,
  destinationForRoute,
  destinationHash,
  routeForPath,
} from "@/shell/destinations";
import {
  CLOSE_DISTANCE_PX,
  OPEN_DISTANCE_PX,
  edgeSwipeOpens,
  sheetDragCloses,
  sheetDragOffset,
  swipeAxis,
  swipeEdgeAt,
} from "@/shell/edge-swipe";
import { MINIMUM_TOUCH_TARGET, TOOLBAR_HEIGHT, sheetWidth } from "@/shell/metrics";
import { createOverlayStack } from "@/shell/overlay-stack";
import { SWIPE_DELETE_PX, SWIPE_MAX_PX, swipeDeletes, swipeOffset } from "@/shell/row-gesture";
import { THEME_OPTIONS, resolveThemeName, themeIsDark, withAlpha } from "@/shell/theme-model";
import { createToastHub } from "@/shell/toast-hub";

test("the tab bar carries the rail's destinations in rail order", () => {
  assert.deepEqual(
    SHELL_DESTINATIONS.map((destination) => destination.route),
    ["notes", "journal", "tasks", "tags", "people", "trash"],
  );
});

test("every destination names the same route the browser build navigates to", () => {
  for (const destination of SHELL_DESTINATIONS) {
    assert.equal(destinationHash(destination.route), appRouteHash(destination.route));
    assert.equal(resolveAppRoute(destinationHash(destination.route)), destination.route);
  }
});

test("a router path resolves to its destination and anything else to notes", () => {
  for (const destination of SHELL_DESTINATIONS) {
    assert.equal(routeForPath(destination.path), destination.route);
  }
  assert.equal(routeForPath("/journal/"), "journal");
  assert.equal(routeForPath(""), "notes");
  assert.equal(routeForPath("/history/abc"), "notes");
});

test("destinations are unique and every route has one", () => {
  const paths = new Set(SHELL_DESTINATIONS.map((destination) => destination.path));
  assert.equal(paths.size, SHELL_DESTINATIONS.length);
  for (const destination of SHELL_DESTINATIONS) {
    assert.equal(destinationForRoute(destination.route), destination);
  }
});

test("touch targets never shrink below 44 pt, the toolbar included", () => {
  assert.ok(MINIMUM_TOUCH_TARGET >= 44);
  assert.ok(TOOLBAR_HEIGHT >= MINIMUM_TOUCH_TARGET);
});

test("the sheet is 86 percent of the window, and never wider than 360", () => {
  assert.equal(sheetWidth(390), 390 * 0.86);
  assert.equal(sheetWidth(320), 320 * 0.86);
  assert.equal(sheetWidth(430), 360);
  assert.equal(sheetWidth(1024), 360);
});

test("system themes follow the platform and a named theme overrides it", () => {
  assert.equal(resolveThemeName("system", "dark"), "midnight");
  assert.equal(resolveThemeName("system", "light"), "paper");
  assert.equal(resolveThemeName("gruvbox", "light"), "gruvbox");
  assert.equal(themeIsDark(resolveThemeName("system", "dark")), true);
  assert.equal(themeIsDark(resolveThemeName("system", "light")), false);
});

test("every generated theme can be chosen by hand", () => {
  assert.deepEqual(THEME_OPTIONS.map((option) => option.name).sort(), [...THEME_NAMES].sort());
});

test("a token fades without leaving the generated colour space", () => {
  assert.equal(withAlpha("hsl(0, 0%, 91%)", 0.55), "hsla(0, 0%, 91%, 0.55)");
  assert.equal(withAlpha("hsl(0, 0%, 91%)", 2), "hsla(0, 0%, 91%, 1)");
  assert.equal(withAlpha("hsl(0, 0%, 91%)", -1), "hsla(0, 0%, 91%, 0)");
  assert.equal(withAlpha("rgb(1, 2, 3)", 0.5), "rgb(1, 2, 3)");
});

test("back closes the overlay on top, then leaves the application", () => {
  const stack = createOverlayStack();
  const closed: string[] = [];
  stack.open(() => closed.push("sheet"));
  stack.open(() => closed.push("menu"));

  assert.equal(stack.handleBack(), true);
  assert.equal(stack.handleBack(), true);
  assert.deepEqual(closed, ["menu", "sheet"]);
  assert.equal(stack.handleBack(), false);
  assert.equal(stack.depth, 0);
});

test("an overlay closed any other way no longer answers back", () => {
  const stack = createOverlayStack();
  const closed: string[] = [];
  const releaseSheet = stack.open(() => closed.push("sheet"));
  stack.open(() => closed.push("menu"));
  releaseSheet();
  releaseSheet();

  assert.equal(stack.handleBack(), true);
  assert.equal(stack.handleBack(), false);
  assert.deepEqual(closed, ["menu"]);
});

test("a pull to the left drags the row and deletes past 96 points", () => {
  assert.equal(swipeOffset(-40), -40);
  assert.equal(swipeDeletes(swipeOffset(-40), 0), false);
  assert.equal(swipeDeletes(swipeOffset(-SWIPE_DELETE_PX), 0), true);
});

test("a pull past the delete point resists and stops at the maximum", () => {
  assert.ok(-swipeOffset(-SWIPE_DELETE_PX - 40) < SWIPE_DELETE_PX + 40);
  assert.equal(-swipeOffset(-400), SWIPE_MAX_PX);
});

test("a pull to the right never moves the row", () => {
  assert.equal(swipeOffset(60), 0);
});

test("a flick deletes from halfway, a slow short pull does not", () => {
  const halfway = swipeOffset(-SWIPE_DELETE_PX / 2);

  assert.equal(swipeDeletes(halfway, -2000), true);
  assert.equal(swipeDeletes(halfway, -100), false);
  assert.equal(swipeDeletes(swipeOffset(-20), -5000), false);
});

test("the edge strips recognise which sheet a pull asks for", () => {
  assert.equal(swipeEdgeAt(4, 390), "left");
  assert.equal(swipeEdgeAt(386, 390), "right");
  assert.equal(swipeEdgeAt(200, 390), null);

  assert.equal(edgeSwipeOpens({ x: 0, y: 0, edge: "left" }, OPEN_DISTANCE_PX), "left");
  assert.equal(edgeSwipeOpens({ x: 0, y: 0, edge: "left" }, OPEN_DISTANCE_PX - 1), null);
  assert.equal(edgeSwipeOpens({ x: 0, y: 0, edge: "right" }, -OPEN_DISTANCE_PX), "right");
  assert.equal(edgeSwipeOpens({ x: 0, y: 0, edge: null }, 200), null);
});

test("a sheet only follows a pull back toward its own edge", () => {
  assert.equal(sheetDragOffset("left", -40), -40);
  assert.equal(sheetDragOffset("left", 40), 0);
  assert.equal(sheetDragOffset("right", 40), 40);
  assert.equal(sheetDragCloses("left", -CLOSE_DISTANCE_PX), true);
  assert.equal(sheetDragCloses("left", -CLOSE_DISTANCE_PX + 1), false);
  assert.equal(sheetDragCloses("right", CLOSE_DISTANCE_PX), true);
});

test("swiping locks to an axis only once the finger means it", () => {
  const start = { x: 0, y: 0, edge: null };

  assert.equal(swipeAxis(start, 4, 4), null);
  assert.equal(swipeAxis(start, 20, 4), "x");
  assert.equal(swipeAxis(start, 4, 20), "y");
});

test("an undo can be taken once, and a stale dismissal never closes its successor", () => {
  const hub = createToastHub();
  const undone: string[] = [];
  const first = hub.show({
    message: "Deleted Inbox",
    action: { label: "Undo", run: () => undone.push("first") },
  });
  const second = hub.show({
    message: "Deleted Drafts",
    action: { label: "Undo", run: () => undone.push("second") },
  });

  hub.dismiss(first);
  assert.equal(hub.current()?.id, second);

  hub.runAction(second);
  hub.runAction(second);
  assert.deepEqual(undone, ["second"]);
  assert.equal(hub.current(), null);
});

test("a toast publishes to its subscribers and stops when they leave", () => {
  const hub = createToastHub();
  let notified = 0;
  const unsubscribe = hub.subscribe(() => {
    notified += 1;
  });

  hub.show({ message: "Deleted Inbox" });
  assert.equal(notified, 1);

  unsubscribe();
  hub.show({ message: "Deleted Drafts" });
  assert.equal(notified, 1);
});
