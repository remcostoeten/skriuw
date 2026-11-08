import assert from "node:assert/strict";
import { test } from "vitest";
import {
  THEME_ENTRIES,
  activeThemeIndex,
  isVariantActive,
  moveThemeTile,
  nextThemeVariant,
  shownThemeVariant,
} from "@/features/settings/themes";
import { THEME_OPTIONS } from "@/features/settings/settings-model";

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

test("a family tile previews the active variant, then the remembered one, then the first", () => {
  const catppuccin = THEME_ENTRIES.find((entry) => entry.id === "mocha");
  assert.ok(catppuccin);
  assert.equal(shownThemeVariant(catppuccin, "catppuccin-latte", undefined), "catppuccin-latte");
  assert.equal(shownThemeVariant(catppuccin, "midnight", "catppuccin-latte"), "catppuccin-latte");
  assert.equal(shownThemeVariant(catppuccin, "midnight", undefined), "mocha");
  const paper = THEME_ENTRIES.find((entry) => entry.id === "paper");
  assert.ok(paper);
  assert.equal(shownThemeVariant(paper, "midnight", undefined), "paper");
});

test("switching variants flips between a family's variants and wraps", () => {
  const rosePine = THEME_ENTRIES.find((entry) => entry.id === "rose-pine");
  assert.ok(rosePine);
  assert.equal(nextThemeVariant(rosePine, "rose-pine"), "rose-pine-dawn");
  assert.equal(nextThemeVariant(rosePine, "rose-pine-dawn"), "rose-pine");
});

test("families keep one tile so the grid never grows when a variant changes", () => {
  assert.equal(THEME_ENTRIES.length, 7);
  for (const entry of THEME_ENTRIES) {
    for (const variant of entry.variants ?? []) {
      assert.equal(activeThemeIndex(variant.id), THEME_ENTRIES.indexOf(entry));
    }
  }
});

test("arrow keys walk the theme grid without Home, End or page keys", () => {
  assert.equal(moveThemeTile(0, "ArrowRight", 7, 3), 1);
  assert.equal(moveThemeTile(6, "ArrowRight", 7, 3), 0);
  assert.equal(moveThemeTile(0, "ArrowLeft", 7, 3), 6);
  assert.equal(moveThemeTile(1, "ArrowDown", 7, 3), 4);
  assert.equal(moveThemeTile(4, "ArrowDown", 7, 3), 6);
  assert.equal(moveThemeTile(6, "ArrowDown", 7, 3), 6);
  assert.equal(moveThemeTile(4, "ArrowUp", 7, 3), 1);
  assert.equal(moveThemeTile(1, "ArrowUp", 7, 3), 1);
});
