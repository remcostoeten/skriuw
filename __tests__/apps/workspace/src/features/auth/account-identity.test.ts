import assert from "node:assert/strict";
import { test } from "vitest";
import { accountDisplayName, accountInitials } from "@/features/auth/account-identity";

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
