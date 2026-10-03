import assert from "node:assert/strict";
import { test } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AccountAvatar } from "@/features/auth/account-avatar";

function render(seed: string, facehash: boolean): string {
  return renderToStaticMarkup(createElement(AccountAvatar, { seed, initials: "RS", facehash }));
}

test("the account face is derived from the account id and is stable", () => {
  const first = render("user_01", true);
  assert.match(first, /data-facehash/);
  assert.doesNotMatch(first, />RS</);
  assert.equal(render("user_01", true), first);
});

test("different accounts can get different faces", () => {
  const faces = new Set(
    ["user_01", "user_02", "user_03", "user_04", "user_05", "user_06"].map((seed) =>
      render(seed, true),
    ),
  );
  assert.ok(faces.size > 1);
});

test("turning the face off shows the initials", () => {
  const markup = render("user_01", false);
  assert.equal(markup, "RS");
});

test("the face uses only neutral theme tones", () => {
  const markup = render("user_01", true);
  assert.doesNotMatch(markup, /bg-(pink|blue|green|red|amber|purple)/);
  assert.match(markup, /bg-(muted|secondary|accent|foreground)/);
});
