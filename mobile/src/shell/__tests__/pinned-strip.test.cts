import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { flattenStyle, interactiveHosts, renderHosts, setWorkspaceValue } from "./native-host.cjs";
import { MINIMUM_TOUCH_TARGET } from "../metrics";
import { PinnedStrip } from "../pinned-strip";

function renderPinned(onOpen: (noteId: string) => void = () => undefined) {
  setWorkspaceValue([
    { id: "a", title: "A" },
    { id: "native-shell", title: "Native shell" },
  ]);
  return renderHosts(createElement(PinnedStrip, { onOpen }));
}

test("every pinned row is a target of at least 44 × 44 pt", () => {
  const rows = interactiveHosts(renderPinned());
  assert.equal(rows.length, 2);
  for (const row of rows) {
    const style = flattenStyle(row.props.style);
    assert.ok(Number(style.height) >= MINIMUM_TOUCH_TARGET, `${String(row.props.accessibilityLabel)} height`);
    assert.ok(Number(style.minWidth) >= MINIMUM_TOUCH_TARGET, `${String(row.props.accessibilityLabel)} width`);
  }
});

test("a pinned row keeps its name and opens its note", () => {
  const opened: string[] = [];
  const [first] = interactiveHosts(renderPinned((noteId) => opened.push(noteId)));
  assert.equal(first?.props.accessibilityRole, "button");
  assert.equal(first.props.accessibilityLabel, "Open A");
  (first.props.onPress as () => void)();
  assert.deepEqual(opened, ["a"]);
});
