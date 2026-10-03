import assert from "node:assert/strict";
import { test } from "vitest";
import type { WorkspaceSettings } from "@skriuw/renderer-core/contracts/workspace";
import { changeHistoryDiffLayout, historyDiffLayout } from "@/features/history/diff";
import { DEFAULT_WORKSPACE_SETTINGS } from "@/features/settings/settings-model";

const extendedSettings: WorkspaceSettings = {
  ...DEFAULT_WORKSPACE_SETTINGS,
  futureSetting: { nested: ["kept", 3] },
};

test("history diff layout is unified unless the workspace explicitly chose split", () => {
  assert.equal(historyDiffLayout(DEFAULT_WORKSPACE_SETTINGS), "unified");
  assert.equal(
    historyDiffLayout({ ...DEFAULT_WORKSPACE_SETTINGS, historyDiffLayout: "split" }),
    "split",
  );
  assert.equal(
    historyDiffLayout({ ...DEFAULT_WORKSPACE_SETTINGS, historyDiffLayout: "stacked" }),
    "unified",
  );
});

test("changing the history diff layout keeps unrelated settings intact", () => {
  const changed = changeHistoryDiffLayout(extendedSettings, "split");

  assert.equal(historyDiffLayout(changed), "split");
  assert.deepEqual(changed.futureSetting, { nested: ["kept", 3] });
  assert.deepEqual(changed.shortcutOverrides, extendedSettings.shortcutOverrides);
});
