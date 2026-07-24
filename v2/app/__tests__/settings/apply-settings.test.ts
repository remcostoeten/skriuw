import assert from "node:assert/strict";
import test from "node:test";
import {
  applySettingsToRoot,
  cssStringLiteral,
  rootSettingsAttributes,
} from "../../src/settings/apply-settings";
import { DEFAULT_WORKSPACE_SETTINGS } from "../../src/settings/settings-model";

function rootStub(): { dataset: { theme?: string; reduceMotion?: string } } {
  return { dataset: {} };
}

test("root attributes project the theme and reduce-motion flag", () => {
  assert.deepEqual(rootSettingsAttributes(DEFAULT_WORKSPACE_SETTINGS), {
    theme: "midnight",
    reduceMotion: false,
  });
  assert.deepEqual(
    rootSettingsAttributes({
      ...DEFAULT_WORKSPACE_SETTINGS,
      theme: "paper",
      reduceMotion: true,
    }),
    { theme: "paper", reduceMotion: true },
  );
});

test("unsupported themes apply the default palette", () => {
  const root = rootStub();
  applySettingsToRoot(root, { ...DEFAULT_WORKSPACE_SETTINGS, theme: "future-theme" });
  assert.equal(root.dataset.theme, "midnight");
});

test("reduce motion toggles the root marker attribute", () => {
  const root = rootStub();
  applySettingsToRoot(root, { ...DEFAULT_WORKSPACE_SETTINGS, reduceMotion: true });
  assert.equal(root.dataset.reduceMotion, "true");
  applySettingsToRoot(root, DEFAULT_WORKSPACE_SETTINGS);
  assert.equal("reduceMotion" in root.dataset, false);
});

test("placeholder text escapes into a CSS string literal", () => {
  assert.equal(cssStringLiteral("Start writing..."), '"Start writing..."');
  assert.equal(cssStringLiteral('Say "hi"'), '"Say \\"hi\\""');
  assert.equal(cssStringLiteral("back\\slash"), '"back\\\\slash"');
  assert.equal(cssStringLiteral("line\nbreak"), '"line break"');
});
