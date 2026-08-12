import assert from "node:assert/strict";
import test from "node:test";
import { SettingToggle } from "../../../../src/features/settings/sections/settings-shared";

test("SettingToggle is a component function", () => {
  assert.equal(typeof SettingToggle, "function");
});
