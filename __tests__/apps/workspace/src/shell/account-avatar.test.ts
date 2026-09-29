import assert from "node:assert/strict";
import { test } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AccountAvatar } from "@/shell/account-avatar";

function render(seed: string, facehash: boolean): string {
  return renderToStaticMarkup(createElement(AccountAvatar, { seed, initials: "RS", facehash }));
}

test("the generated face renders instead of initials when faces are on", () => {
  const html = render("user_123", true);
  assert.match(html, /data-facehash=""/);
  assert.match(html, /aria-hidden="true"/);
  assert.doesNotMatch(html, />RS</);
});

test("the same account always renders the same face", () => {
  assert.equal(render("user_123", true), render("user_123", true));
});

test("different accounts get different faces", () => {
  const faces = new Set(
    ["user_1", "user_2", "user_3", "user_4", "user_5", "user_6"].map((seed) => render(seed, true)),
  );
  assert.ok(faces.size > 1);
});

test("turning faces off falls back to the account initials", () => {
  const html = render("user_123", false);
  assert.equal(html, "RS");
});
