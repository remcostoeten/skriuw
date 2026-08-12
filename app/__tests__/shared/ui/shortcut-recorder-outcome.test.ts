import assert from "node:assert/strict";
import test from "node:test";
import { recordedComboOutcome } from "../../../src/shared/ui/shortcut-recorder";

test("escape and empty captures cancel without touching the binding", () => {
  assert.equal(recordedComboOutcome("escape"), "cancel");
  assert.equal(recordedComboOutcome(""), "cancel");
});

test("plain enter closes capture keeping the current binding", () => {
  assert.equal(recordedComboOutcome("enter"), "keep");
});

test("modified enter and ordinary combos commit as the new binding", () => {
  assert.equal(recordedComboOutcome("ctrl+enter"), "commit");
  assert.equal(recordedComboOutcome("cmd+shift+enter"), "commit");
  assert.equal(recordedComboOutcome("ctrl+3"), "commit");
  assert.equal(recordedComboOutcome("f5"), "commit");
});
