import assert from "node:assert/strict";
import test from "node:test";
import { toggleFullscreen, quitApp } from "../../src/actions/window";

test("window action exports exist and can be called", () => {
  assert.equal(typeof toggleFullscreen, "function");
  assert.equal(typeof quitApp, "function");
});
