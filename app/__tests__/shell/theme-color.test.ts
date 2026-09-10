import assert from "node:assert/strict";
import test from "node:test";
import { themeColorFrom } from "../../src/shell/theme-color";

function styleWith(background: string) {
  return { getPropertyValue: () => background };
}

test("themeColorFrom wraps the palette background token in a colour function", () => {
  assert.equal(themeColorFrom(styleWith(" 2 0% 7% ")), "hsl(2 0% 7%)");
  assert.equal(themeColorFrom(styleWith("40 16% 95%")), "hsl(40 16% 95%)");
});

test("themeColorFrom reports nothing when the token is unresolved", () => {
  assert.equal(themeColorFrom(styleWith("")), null);
});
