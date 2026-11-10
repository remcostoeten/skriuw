import assert from "node:assert/strict";
import { test } from "vitest";
import { ABOUT_LINKS } from "@/features/settings-dialog/about/model";

test("every about link points at an https destination", () => {
  assert.ok(ABOUT_LINKS.length > 0);
  for (const link of ABOUT_LINKS) {
    assert.ok(link.url.startsWith("https://"), `insecure ${link.id}`);
  }
});

test("about link ids are unique", () => {
  const ids = new Set(ABOUT_LINKS.map((link) => link.id));
  assert.equal(ids.size, ABOUT_LINKS.length);
});
