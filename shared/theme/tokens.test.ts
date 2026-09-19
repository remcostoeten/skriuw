import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { parseThemes, renderTokens } from "./generate";
import { DARK_THEMES, THEME_NAMES, THEME_TOKENS, TOKEN_NAMES } from "./tokens";

const THEMES_CSS = new URL("../../app/src/themes.css", import.meta.url);
const TOKENS_TS = new URL("./tokens.ts", import.meta.url);

test("all nine themes ship", () => {
  assert.deepEqual(
    [...THEME_NAMES].sort(),
    [
      "catppuccin-latte",
      "embers",
      "gruvbox",
      "midnight",
      "mocha",
      "paper",
      "rose-pine",
      "rose-pine-dawn",
      "tokyo-night",
    ],
  );
});

test("every theme defines every token as an hsl() string", () => {
  for (const theme of THEME_NAMES) {
    assert.deepEqual(Object.keys(THEME_TOKENS[theme]), [...TOKEN_NAMES], theme);
    for (const token of TOKEN_NAMES) {
      assert.match(
        THEME_TOKENS[theme][token],
        /^hsl\(-?[\d.]+, [\d.]+%, [\d.]+%\)$/,
        `${theme} --${token}`,
      );
    }
  }
});

test("midnight --background resolves to hsl(2, 0%, 7%)", () => {
  assert.equal(THEME_TOKENS.midnight.background, "hsl(2, 0%, 7%)");
});

test("var() indirections resolve to the referenced color", () => {
  for (const theme of THEME_NAMES) {
    assert.equal(THEME_TOKENS[theme]["mood-neutral"], THEME_TOKENS[theme]["muted-foreground"]);
    assert.equal(THEME_TOKENS[theme]["editor-selection"], THEME_TOKENS[theme].foreground);
  }
});

test("the dark flag follows the light themes declared in base.css", () => {
  const light = THEME_NAMES.filter((theme) => !DARK_THEMES[theme]);
  assert.deepEqual([...light].sort(), ["catppuccin-latte", "paper", "rose-pine-dawn"]);
});

test("committed tokens match themes.css", () => {
  const expected = renderTokens(parseThemes(readFileSync(THEMES_CSS, "utf8")));
  assert.equal(readFileSync(TOKENS_TS, "utf8"), expected);
});

test("a theme missing a token is rejected", () => {
  const css = `
    :root[data-theme="one"] { --background: 0 0% 7%; --foreground: 0 0% 91%; }
    :root[data-theme="two"] { --background: 0 0% 95%; }
  `;
  assert.throws(() => parseThemes(css), /two: token set differs.*missing: foreground/);
});

test("a non-color value is rejected", () => {
  const css = `:root[data-theme="one"] { --background: red; }`;
  assert.throws(() => parseThemes(css), /not an HSL triple/);
});

test("commented-out declarations and braces are ignored", () => {
  const css = `:root[data-theme="one"] {
    --background: 0 0% 7%;
    /* --background: 0 0% 95%; } */
    --foreground: 0 0% 91%;
  }`;
  const [theme] = parseThemes(css);
  assert.deepEqual(theme.tokens, { background: "hsl(0, 0%, 7%)", foreground: "hsl(0, 0%, 91%)" });
});
