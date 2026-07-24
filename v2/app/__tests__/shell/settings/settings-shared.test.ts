import assert from "node:assert/strict";
import test from "node:test";
import { SettingToggle } from "../../../src/shell/settings/settings-shared";

test("SettingToggle is a component function", () => {
  assert.equal(typeof SettingToggle, "function");
});
