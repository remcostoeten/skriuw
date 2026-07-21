import assert from "node:assert/strict";
import test from "node:test";
import { resolveAppRoute } from "../src/app-route";

test("trash has a dedicated hash route and unknown routes return to notes", () => {
  assert.equal(resolveAppRoute("#/trash"), "trash");
  assert.equal(resolveAppRoute("#/notes"), "notes");
  assert.equal(resolveAppRoute("#/trash/nested"), "notes");
});
