import assert from "node:assert/strict";
import test from "node:test";
import { toggleMaximize, quitApp } from "../../../src/store/actions/window";

test("window action exports exist and can be called", () => {
  assert.equal(typeof toggleMaximize, "function");
  assert.equal(typeof quitApp, "function");
});
