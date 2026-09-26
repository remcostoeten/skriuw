import assert from "node:assert/strict";
import { test } from "vitest";
import { InMemoryCustomThemeRegistry, THEME_SCHEMA_VERSION, THEME_TOKENS } from "@skriuw/theme";
import {
  applySettingsToRoot,
  cssStringLiteral,
  rootSettingsAttributes,
} from "@/features/settings/apply-settings";
import { DEFAULT_WORKSPACE_SETTINGS } from "@/features/settings/settings-model";

function rootStub() {
  const properties = new Map<string, string>();
  return {
    dataset: {} as { theme?: string; colorScheme?: string },
    properties,
    style: {
      setProperty: (property: string, value: string) => properties.set(property, value),
      removeProperty: (property: string) => {
        properties.delete(property);
      },
    },
  };
}

test("root attributes project the theme", () => {
  assert.deepEqual(rootSettingsAttributes(DEFAULT_WORKSPACE_SETTINGS), {
    theme: "midnight",
    colorScheme: "dark",
  });
  assert.deepEqual(rootSettingsAttributes({ ...DEFAULT_WORKSPACE_SETTINGS, theme: "paper" }), {
    theme: "paper",
    colorScheme: "light",
  });
});

test("unsupported themes apply the default palette", () => {
  const root = rootStub();
  applySettingsToRoot(root, { ...DEFAULT_WORKSPACE_SETTINGS, theme: "future-theme" });
  assert.equal(root.dataset.theme, "midnight");
  assert.equal(root.dataset.colorScheme, "dark");
});

test("custom themes apply validated tokens and built-ins clear them", () => {
  const themes = new InMemoryCustomThemeRegistry();
  themes.set({
    schemaVersion: THEME_SCHEMA_VERSION,
    id: "custom-solar",
    label: "Solar",
    colorScheme: "light",
    tokens: THEME_TOKENS.paper,
  });
  const root = rootStub();
  applySettingsToRoot(root, { ...DEFAULT_WORKSPACE_SETTINGS, theme: "custom-solar" }, themes);
  assert.equal(root.dataset.theme, "custom-solar");
  assert.equal(root.dataset.colorScheme, "light");
  assert.equal(root.properties.get("--background"), "40 16% 95%");

  applySettingsToRoot(root, DEFAULT_WORKSPACE_SETTINGS, themes);
  assert.equal(root.properties.has("--background"), false);
});

test("placeholder text escapes into a CSS string literal", () => {
  assert.equal(cssStringLiteral("Start writing..."), '"Start writing..."');
  assert.equal(cssStringLiteral('Say "hi"'), '"Say \\"hi\\""');
  assert.equal(cssStringLiteral("back\\slash"), '"back\\\\slash"');
  assert.equal(cssStringLiteral("line\nbreak"), '"line break"');
});
