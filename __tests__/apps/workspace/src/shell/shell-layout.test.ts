import assert from "node:assert/strict";
import { test } from "vitest";
import { activationClosesSidebar, compactPanelPolicy, shellMode } from "@/shell/shell-layout";

test("compact mode offers the tree only while there is nothing to read", () => {
  assert.deepEqual(compactPanelPolicy(false), { sidebarOpen: true, metadataOpen: false });
  assert.deepEqual(compactPanelPolicy(true), { sidebarOpen: false, metadataOpen: false });
});

test("a note activation dismisses the tree sheet only in compact mode", () => {
  assert.equal(activationClosesSidebar("compact", true, null, "a"), true);
  assert.equal(activationClosesSidebar("compact", true, "a", "b"), true);
  assert.equal(activationClosesSidebar("compact", true, "a", "a"), false);
  assert.equal(activationClosesSidebar("compact", false, null, "a"), false);
  assert.equal(activationClosesSidebar("full", true, null, "a"), false);
  assert.equal(activationClosesSidebar("compact", true, "a", null), false);
});

test("shellMode names the two layouts", () => {
  assert.equal(shellMode(true), "compact");
  assert.equal(shellMode(false), "full");
});
