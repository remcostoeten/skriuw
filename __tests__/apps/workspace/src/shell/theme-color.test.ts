import assert from "node:assert/strict";
import { test } from "vitest";
import { themeColorFrom } from "@/shell/theme-color";

function styleWith(tokens: Record<string, string>) {
  return { getPropertyValue: (property: string) => tokens[property] ?? "" };
}

test("themeColorFrom follows the chrome token the toolbars paint with", () => {
  assert.equal(
    themeColorFrom(styleWith({ "--sidebar-background": " 2 0% 5% ", "--background": "2 0% 7%" })),
    "hsl(2 0% 5%)",
  );
});

test("themeColorFrom falls back to the page background", () => {
  assert.equal(themeColorFrom(styleWith({ "--background": "40 16% 95%" })), "hsl(40 16% 95%)");
});

test("themeColorFrom reports nothing when no token resolves", () => {
  assert.equal(themeColorFrom(styleWith({})), null);
});
