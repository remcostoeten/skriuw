import assert from "node:assert/strict";
import test from "node:test";
import { shortcutDefinitionsForState } from "../../src/shortcuts/workspace-shortcuts";
import { SHORTCUT_DEFINITIONS } from "../../src/shortcuts/definitions";

test("suspended shortcuts retain only the explicitly active binding", () => {
  assert.deepEqual(shortcutDefinitionsForState(true), []);
  assert.deepEqual(
    shortcutDefinitionsForState(true, "openSettings").map((definition) => definition.id),
    ["openSettings"],
  );
  assert.equal(shortcutDefinitionsForState(false), SHORTCUT_DEFINITIONS);
});
