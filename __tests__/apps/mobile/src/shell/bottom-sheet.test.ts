import assert from "node:assert/strict";
import { test } from "vitest";
import { createElement, type ComponentProps } from "react";
import { flattenStyle, interactiveHosts, renderHosts } from "./native-host";
import { BottomSheet } from "@/shell/bottom-sheet";

function renderSheet(props: Partial<ComponentProps<typeof BottomSheet>> = {}) {
  const sheetProps: ComponentProps<typeof BottomSheet> = {
    open: true,
    dismissLabel: "Close go to date",
    onClose: () => undefined,
    children: "panel",
    ...props,
  };
  return renderHosts(createElement(BottomSheet, sheetProps));
}

test("an open bottom sheet is the root of its own modal window and leaves the motion to itself", () => {
  function onClose() {}
  const [root] = renderSheet({ onClose });

  assert.equal(root?.type, "Modal");
  assert.equal(root.props.visible, true);
  assert.equal(root.props.transparent, true);
  assert.equal(
    root.props.animationType,
    "none",
    "a native slide would carry the scrim along with the panel",
  );
  assert.equal(root.props.onRequestClose, onClose, "the Android back action closes the sheet");
});

test("a bottom sheet that was never opened renders no modal window", () => {
  assert.deepEqual(renderSheet({ open: false }), []);
});

test("the scrim is one window-sized button that dismisses the sheet", () => {
  function onClose() {}
  const controls = interactiveHosts(renderSheet({ onClose }));

  assert.equal(controls.length, 1);
  const [scrim] = controls;
  assert.equal(scrim?.props.accessibilityRole, "button");
  assert.equal(scrim.props.accessibilityLabel, "Close go to date");
  assert.equal(scrim.props.onPress, onClose);
  const style = flattenStyle(scrim.props.style);
  assert.equal(style.position, "absolute");
  assert.equal(style.top, 0);
  assert.equal(style.bottom, 0);
});

test("the sheet hands the modal's first show to its owner, so a field can take focus", () => {
  let shown = 0;
  const [root] = renderSheet({
    onShow: () => {
      shown += 1;
    },
  });

  assert.equal(typeof root?.props.onShow, "function");
  if (typeof root?.props.onShow === "function") {
    root.props.onShow();
  }
  assert.equal(shown, 1);
});
