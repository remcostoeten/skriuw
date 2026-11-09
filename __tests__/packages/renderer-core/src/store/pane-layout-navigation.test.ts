import assert from "node:assert/strict";
import { test } from "vitest";
import { isNavigationOnlyLayoutChange } from "../../../../../packages/renderer-core/src/store/pane-layout-persistence";
import type { PaneLayout, PaneState } from "../../../../../packages/renderer-core/src/store/panes";

function layout(panes: PaneState[], ratio = 0.5): PaneLayout {
  return { panes, orientation: "vertical", ratio };
}

function pane(
  openNoteIds: string[],
  activeNoteId: string | null,
  pinned: string[] = [],
): PaneState {
  return { paneId: "primary", openNoteIds, pinnedNoteIds: pinned, activeNoteId };
}

test("switching tabs or replacing the active tab in place is navigation", () => {
  assert.equal(
    isNavigationOnlyLayoutChange(layout([pane(["a", "b"], "a")]), layout([pane(["a", "b"], "b")])),
    true,
  );
  assert.equal(
    isNavigationOnlyLayoutChange(layout([pane(["a", "b"], "a")]), layout([pane(["c", "b"], "c")])),
    true,
  );
});

test("opening, closing, reordering, pinning, and resizing are structural", () => {
  const before = layout([pane(["a", "b"], "a")]);
  assert.equal(isNavigationOnlyLayoutChange(before, layout([pane(["a", "b", "c"], "c")])), false);
  assert.equal(isNavigationOnlyLayoutChange(before, layout([pane(["a"], "a")])), false);
  assert.equal(isNavigationOnlyLayoutChange(before, layout([pane(["b", "a"], "a")])), false);
  assert.equal(isNavigationOnlyLayoutChange(before, layout([pane(["a", "b"], "a", ["a"])])), false);
  assert.equal(isNavigationOnlyLayoutChange(before, layout([pane(["a", "b"], "a")], 0.6)), false);
});
