import assert from "node:assert/strict";
import test from "node:test";
import {
  BUILTIN_THEMES,
  InMemoryCustomThemeRegistry,
  THEME_SCHEMA_VERSION,
  isBuiltinThemeId,
  resolveTheme,
  validateThemeDefinition,
} from "./registry";
import { THEME_NAMES, THEME_TOKENS } from "./tokens";

test("the registry is the complete built-in theme catalog", () => {
  assert.deepEqual(
    BUILTIN_THEMES.map((theme) => theme.id).toSorted(),
    [...THEME_NAMES].toSorted(),
  );
  for (const theme of BUILTIN_THEMES) assert.equal(isBuiltinThemeId(theme.id), true);
});

test("unknown themes resolve to the safe default", () => {
  assert.equal(resolveTheme("missing").id, "midnight");
});

test("validated custom themes resolve through a custom registry", () => {
  const themes = new InMemoryCustomThemeRegistry();
  themes.set({
    schemaVersion: THEME_SCHEMA_VERSION,
    id: "custom-paper",
    label: "My Paper",
    colorScheme: "light",
    tokens: THEME_TOKENS.paper,
  });
  const resolved = resolveTheme("custom-paper", themes);
  assert.equal(resolved.source, "custom");
  assert.equal(resolved.colorScheme, "light");
});

test("custom themes require a complete, normalized token map", () => {
  const invalid = {
    schemaVersion: THEME_SCHEMA_VERSION,
    id: "custom-invalid",
    label: "Invalid",
    colorScheme: "dark" as const,
    tokens: { ...THEME_TOKENS.midnight, foreground: "red" },
  };
  assert.match(validateThemeDefinition(invalid), /foreground/);
});
