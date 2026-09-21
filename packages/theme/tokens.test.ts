import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { parseThemes, renderTokens } from "./generate";
import { BUILTIN_THEMES } from "./metadata";
import { DARK_THEMES, THEME_NAMES, THEME_TOKENS, TOKEN_NAMES } from "./tokens";

const THEMES_CSS = new URL("../../apps/workspace/src/themes.css", import.meta.url);
const TOKENS_TS = new URL("./tokens.ts", import.meta.url);

function hslToRgb(color: string): readonly [number, number, number] {
  const match = /^hsl\((-?[\d.]+), ([\d.]+)%, ([\d.]+)%\)$/.exec(color);
  assert.ok(match);
  const hue = ((Number(match[1]) % 360) + 360) % 360 / 360;
  const saturation = Number(match[2]) / 100;
  const lightness = Number(match[3]) / 100;
  const amplitude = saturation * Math.min(lightness, 1 - lightness);
  function channel(offset: number): number {
    const position = (offset + hue * 12) % 12;
    return lightness - amplitude * Math.max(-1, Math.min(position - 3, 9 - position, 1));
  }
  return [channel(0), channel(8), channel(4)];
}

function luminance(color: string): number {
  const channels = hslToRgb(color).map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrast(left: string, right: string): number {
  const first = luminance(left);
  const second = luminance(right);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

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

test("the generated dark flag follows explicit registry metadata", () => {
  const light = THEME_NAMES.filter((theme) => !DARK_THEMES[theme]);
  assert.deepEqual([...light].sort(), ["catppuccin-latte", "paper", "rose-pine-dawn"]);
});

test("core foreground pairs meet WCAG AA contrast", () => {
  const pairs = [
    ["foreground", "background"],
    ["card-foreground", "card"],
    ["popover-foreground", "popover"],
    ["primary-foreground", "primary"],
    ["sidebar-foreground", "sidebar-background"],
    ["destructive-foreground", "destructive"],
  ] as const;
  for (const theme of THEME_NAMES) {
    for (const [foreground, background] of pairs) {
      assert.ok(
        contrast(THEME_TOKENS[theme][foreground], THEME_TOKENS[theme][background]) >= 4.5,
        `${theme}: --${foreground} on --${background}`,
      );
    }
  }
});

test("committed tokens match themes.css", () => {
  const expected = renderTokens(parseThemes(readFileSync(THEMES_CSS, "utf8"), BUILTIN_THEMES));
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

test("a final declaration without a semicolon is kept", () => {
  const css = `:root[data-theme="one"] { --background: 0 0% 7%; --Accent_2: 10 20% 30% }`;
  const [theme] = parseThemes(css);
  assert.equal(theme.tokens.Accent_2, "hsl(10, 20%, 30%)");
});

test("an unparseable statement is rejected instead of skipped", () => {
  const css = `:root[data-theme="one"] { --background: 0 0% 7%; color-scheme: dark; }`;
  assert.throws(() => parseThemes(css), /cannot parse "color-scheme: dark"/);
});

test("duplicate token declarations are rejected", () => {
  const css = `:root[data-theme="one"] { --background: 0 0% 7%; --background: 0 0% 8%; }`;
  assert.throws(() => parseThemes(css), /declares --background more than once/);
});

test("built-in metadata must exactly match the CSS theme set", () => {
  const css = `:root[data-theme="one"] { --background: 0 0% 7%; }`;
  assert.throws(
    () =>
      parseThemes(css, [
        {
          id: "two",
          label: "Two",
          colorScheme: "light",
          swatchFrom: "hsl(0 0% 0%)",
          swatchTo: "hsl(0 0% 100%)",
        },
      ]),
    /theme metadata differs/,
  );
});
