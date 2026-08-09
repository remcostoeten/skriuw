import assert from "node:assert/strict";
import test from "node:test";
import {
  accountDisplayName,
  accountInitials,
  accountMenuPanelTitle,
  activeThemeLabel,
  themeMenuOptions,
  COMPACT_MENU_QUERY,
  type AccountMenuPanel,
} from "../../src/shell/account-menu-model";
import { THEME_ENTRIES } from "../../src/settings/themes";

test("every selectable theme reaches the menu exactly once", () => {
  const options = themeMenuOptions();
  const ids = options.map((option) => option.id);
  assert.equal(new Set(ids).size, ids.length);

  const selectable: string[] = [];
  for (const entry of THEME_ENTRIES) {
    if (entry.variants) {
      selectable.push(...entry.variants.map((variant) => variant.id));
    } else {
      selectable.push(entry.id);
    }
  }
  assert.deepEqual([...ids].sort(), [...selectable].sort());
  for (const option of options) {
    assert.ok(option.label.length > 0);
  }
});

test("grouped palettes keep their family name so variants stay distinguishable", () => {
  const options = themeMenuOptions();
  assert.equal(activeThemeLabel("mocha"), "Catppuccin Mocha");
  assert.equal(activeThemeLabel("catppuccin-latte"), "Catppuccin Latte");
  assert.notEqual(
    options.find((option) => option.id === "rose-pine")?.label,
    options.find((option) => option.id === "rose-pine-dawn")?.label,
  );
});

test("a theme id that no longer exists renders as itself instead of blank", () => {
  assert.equal(activeThemeLabel("retired-theme"), "retired-theme");
});

test("the display name falls back to the email local part", () => {
  assert.equal(accountDisplayName("Remco Stoeten", "remco@skriuw.com"), "Remco Stoeten");
  assert.equal(accountDisplayName("   ", "remco@skriuw.com"), "remco");
  assert.equal(accountDisplayName(null, "remco@skriuw.com"), "remco");
  assert.equal(accountDisplayName(undefined, "nodomain"), "nodomain");
});

test("initials take one letter per word and never exceed two characters", () => {
  assert.equal(accountInitials("Remco Stoeten", "remco@skriuw.com"), "RS");
  assert.equal(accountInitials("Remco van der Stoeten", "remco@skriuw.com"), "RV");
  assert.equal(accountInitials("Prince", "p@skriuw.com"), "PR");
  assert.equal(accountInitials(null, "remco.stoeten@skriuw.com"), "RS");
  assert.equal(accountInitials(null, "r@skriuw.com"), "R");
  for (const initials of [
    accountInitials("Remco Stoeten", "remco@skriuw.com"),
    accountInitials(null, "remco.stoeten@skriuw.com"),
    accountInitials("Prince", "p@skriuw.com"),
  ]) {
    assert.ok(initials.length <= 2);
  }
});

test("an unusable name and email still produce a rendered avatar", () => {
  assert.equal(accountInitials("", ""), "?");
  assert.equal(accountInitials(null, "  "), "?");
});

test("every compact panel names itself so its back row is never blank", () => {
  const panels: AccountMenuPanel[] = ["root", "appearance", "transfer"];
  const titles = panels.map(accountMenuPanelTitle);
  assert.equal(new Set(titles).size, titles.length);
  for (const title of titles) {
    assert.ok(title.length > 0);
  }
});

test("the compact menu collapses at the same width as the settings dialog", () => {
  assert.equal(COMPACT_MENU_QUERY, "(max-width: 620px)");
});
