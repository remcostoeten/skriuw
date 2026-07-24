import assert from "node:assert/strict";
import test from "node:test";
import { cn } from "../../../src/shared/lib/utils";

test("cn merges class names and resolves tailwind conflicts", () => {
  assert.equal(cn("px-2", "py-1"), "px-2 py-1");
  assert.equal(cn("px-2", "px-4"), "px-4");
  assert.equal(cn("flex", false && "inline", undefined, null, "items-center"), "flex items-center");
});
