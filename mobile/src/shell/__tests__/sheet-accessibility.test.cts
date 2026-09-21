import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { flattenStyle, interactiveHosts, renderHosts } from "./native-host.cjs";
import { MINIMUM_TOUCH_TARGET } from "../metrics";
import { SideSheet } from "../sheet";

function renderSheet(open: boolean, onClose: () => void = () => undefined) {
  return renderHosts(
    createElement(SideSheet, { side: "left", open, title: "Notes", onClose, children: "tree" }),
  );
}

test("an open sheet renders in its own modal window, so TalkBack cannot reach the shell behind it", () => {
  const onClose = () => undefined;
  const [root] = renderSheet(true, onClose);

  assert.equal(root?.type, "Modal", "the sheet must be the root of a Modal, not a sibling of the shell");
  assert.equal(root.props.visible, true);
  assert.equal(root.props.transparent, true);
  assert.equal(root.props.onRequestClose, onClose, "the Android back action closes the sheet");
});

test("the sheet stays modal for VoiceOver while open", () => {
  const panel = renderSheet(true).find((node) => node.props.accessibilityViewIsModal !== undefined);
  assert.equal(panel?.props.accessibilityViewIsModal, true);
});

test("a sheet that was never opened renders no modal window", () => {
  assert.deepEqual(renderSheet(false), []);
});

test("both of the sheet's close controls are at least 44 pt", () => {
  const controls = interactiveHosts(renderSheet(true));
  assert.equal(controls.length, 2);
  for (const control of controls) {
    const style = flattenStyle(control.props.style);
    const fillsWindow = style.position === "absolute" && style.top === 0 && style.bottom === 0;
    if (!fillsWindow) {
      assert.ok(Number(style.width) >= MINIMUM_TOUCH_TARGET, `${String(control.props.accessibilityLabel)} width`);
      assert.ok(Number(style.height) >= MINIMUM_TOUCH_TARGET, `${String(control.props.accessibilityLabel)} height`);
    }
  }
});
