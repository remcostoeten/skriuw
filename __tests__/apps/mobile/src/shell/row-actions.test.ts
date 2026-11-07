import assert from "node:assert/strict";
import { test } from "vitest";
import { createElement, type ComponentProps } from "react";
import { flattenStyle, interactiveHosts, renderHosts } from "./native-host";
import { MINIMUM_TOUCH_TARGET } from "@/shell/metrics";
import { RowActions } from "@/shell/row-actions";
import type { TreeRow } from "@/shell/tree-model";

const FOLDER: TreeRow = {
  id: "folder-1",
  kind: "folder",
  title: "Books",
  depth: 0,
  childCount: 2,
  expanded: false,
  pinned: false,
  locked: false,
  active: false,
  setSize: 1,
  posInSet: 1,
};

function noop() {}

function renderActions(row: TreeRow | null, onClose: () => void = noop) {
  const props: ComponentProps<typeof RowActions> = {
    row,
    moveTargets: [],
    onClose,
    onRename: noop,
    onMove: noop,
    onPin: noop,
    onToggleLock: noop,
    onDelete: noop,
    onCreateNote: noop,
    onCreateFolder: noop,
  };
  return renderHosts(createElement(RowActions, props));
}

test("no held row renders no modal window", () => {
  assert.deepEqual(renderActions(null), []);
});

test("a held row opens its actions in a modal the Android back action closes", () => {
  function onClose() {}
  const [root] = renderActions(FOLDER, onClose);

  assert.equal(root?.type, "Modal");
  assert.equal(root.props.animationType, "none");
  assert.equal(root.props.onRequestClose, onClose);
});

test("the scrim and Cancel both close the actions", () => {
  function onClose() {}
  const controls = interactiveHosts(renderActions(FOLDER, onClose));
  const closing = controls.filter((control) => control.props.onPress === onClose);

  assert.deepEqual(
    closing.map((control) => control.props.accessibilityLabel),
    ["Close actions", "Cancel"],
  );
});

test("every action on a folder is a labelled button at least 44 pt tall", () => {
  const controls = interactiveHosts(renderActions(FOLDER)).filter(
    (control) => control.props.accessibilityLabel !== "Close actions",
  );

  assert.deepEqual(
    controls.map((control) => control.props.accessibilityLabel),
    [
      "Rename",
      "Move…",
      "Pin",
      "Lock folder…",
      "New note inside",
      "New folder inside",
      "Delete",
      "Cancel",
    ],
  );
  for (const control of controls) {
    assert.equal(control.props.accessibilityRole, "button");
    assert.ok(
      Number(flattenStyle(control.props.style).minHeight) >= MINIMUM_TOUCH_TARGET,
      `${String(control.props.accessibilityLabel)} height`,
    );
  }
});
