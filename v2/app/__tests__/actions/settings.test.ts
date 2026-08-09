import assert from "node:assert/strict";
import test from "node:test";
import * as settingsActions from "../../src/actions/settings";

test("settings action exports exist and are functions", () => {
  assert.equal(typeof settingsActions.updateSettings, "function");
  assert.equal(typeof settingsActions.updateSetting, "function");
  assert.equal(typeof settingsActions.setShortcutOverride, "function");
  assert.equal(typeof settingsActions.clearShortcutOverride, "function");
  assert.equal(typeof settingsActions.clearAllShortcutOverrides, "function");
});
