import assert from "node:assert/strict";
import test from "node:test";
import { EditorWorkingSet } from "../../../src/features/editor/editor-working-set";

test("evicts the least recently used unprotected entry", () => {
  const workingSet = new EditorWorkingSet<number>(2);
  workingSet.set("a", 1);
  workingSet.set("b", 2);
  assert.equal(workingSet.get("a"), 1);
  workingSet.set("c", 3);

  assert.deepEqual(workingSet.prune(new Set()), ["b"]);
  assert.equal(workingSet.get("a"), 1);
  assert.equal(workingSet.get("b"), undefined);
  assert.equal(workingSet.get("c"), 3);
});

test("retains dirty or active entries even above the clean ceiling", () => {
  const workingSet = new EditorWorkingSet<number>(1);
  workingSet.set("dirty", 1);
  workingSet.set("active", 2);

  assert.deepEqual(workingSet.prune(new Set(["dirty", "active"])), []);
  assert.equal(workingSet.size, 2);
  assert.deepEqual(workingSet.prune(new Set(["active"])), ["dirty"]);
  assert.equal(workingSet.size, 1);
});

test("replacing an entry refreshes its recency", () => {
  const workingSet = new EditorWorkingSet<number>(2);
  workingSet.set("a", 1);
  workingSet.set("b", 2);
  workingSet.set("a", 3);
  workingSet.set("c", 4);

  assert.deepEqual(workingSet.prune(new Set()), ["b"]);
  assert.equal(workingSet.get("a"), 3);
});

test("unrelated evictions do not prove that a protected revisit is cold", () => {
  const workingSet = new EditorWorkingSet<number>(1);
  workingSet.set("revisit", 1);
  workingSet.set("other", 2);

  assert.deepEqual(workingSet.prune(new Set(["revisit"])), ["other"]);
  assert.equal(workingSet.get("revisit"), 1);
});

test("rejects invalid ceilings", () => {
  assert.throws(() => new EditorWorkingSet(0), /positive integer/);
  assert.throws(() => new EditorWorkingSet(1.5), /positive integer/);
});
