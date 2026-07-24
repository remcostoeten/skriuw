import assert from "node:assert/strict";
import test from "node:test";
import {
  THEME_ENTRIES,
  activeThemeIndex,
  isVariantActive,
} from "../../src/settings/themes";
import { THEME_OPTIONS } from "../../src/settings/settings-model";

test("every validated theme id is reachable from a card or a variant", () => {
  const reachable = new Set<string>();
  for (const entry of THEME_ENTRIES) {
    reachable.add(entry.id);
    for (const variant of entry.variants ?? []) {
      reachable.add(variant.id);
    }
  }
  for (const option of THEME_OPTIONS) {
    assert.ok(reachable.has(option.value), `missing ${option.value}`);
  }
});

test("active index resolves a grouped variant to its parent card", () => {
  const rosePine = THEME_ENTRIES.findIndex((entry) => entry.id === "rose-pine");
  assert.equal(activeThemeIndex("rose-pine-dawn"), rosePine);
  assert.equal(activeThemeIndex("rose-pine"), rosePine);
});

test("unknown themes clamp to the first card instead of -1", () => {
  assert.equal(activeThemeIndex("does-not-exist"), 0);
});

test("variant activation is scoped to the owning group", () => {
  const catppuccin = THEME_ENTRIES.find((entry) => entry.id === "mocha");
  const rosePine = THEME_ENTRIES.find((entry) => entry.id === "rose-pine");
  assert.ok(catppuccin && rosePine);
  assert.equal(isVariantActive(catppuccin, "catppuccin-latte"), true);
  assert.equal(isVariantActive(catppuccin, "rose-pine-dawn"), false);
  assert.equal(isVariantActive(rosePine, "midnight"), false);
});
