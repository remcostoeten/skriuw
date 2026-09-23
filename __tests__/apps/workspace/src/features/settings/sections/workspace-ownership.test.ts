import assert from "node:assert/strict";
import { test } from "vitest";
import {
  shortWorkspaceId,
  workspaceOwnershipText,
} from "@/features/settings/sections/workspace-ownership";

const SLOT = `w_${"ab".repeat(32)}`;

test("a signed-out device names the account link so the user knows which sign-in brings the notes back", () => {
  const text = workspaceOwnershipText(SLOT, false);
  assert.ok(text.includes("Sign back into it"));
  assert.ok(text.includes("a different account opens a workspace of its own"));
});

test("an unclaimed device tells the user the first sign-in keeps the notes", () => {
  const text = workspaceOwnershipText(null, false);
  assert.ok(text.includes("Not linked to an account yet"));
  assert.ok(text.includes("first account to sign in keeps these notes"));
});

test("a signed-in device explains that other accounts get their own workspace", () => {
  const text = workspaceOwnershipText(SLOT, true);
  assert.ok(text.startsWith("Linked to this account"));
  assert.ok(text.includes("workspace of its own"));
});

test("a pinned single workspace is described as shared rather than linked", () => {
  assert.ok(workspaceOwnershipText(null, true).includes("Shared by every account"));
});

test("the short id keeps the prefix and the first hex characters", () => {
  assert.equal(shortWorkspaceId(SLOT), "w_abababab…");
});
