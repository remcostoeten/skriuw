import assert from "node:assert/strict";
import test from "node:test";
import {
  lastSavedTextFile,
  readPickedFile,
  rememberPickedFile,
} from "../../src/bridge/browser-files";

test("remembered pick is readable under its display name", () => {
  const path = rememberPickedFile("workspace.json", '{"archiveVersion":1}');
  assert.equal(path, "workspace.json");
  assert.deepEqual(readPickedFile(path), {
    name: "workspace.json",
    text: '{"archiveVersion":1}',
  });
});

test("only the latest pick is retained", () => {
  rememberPickedFile("first.json", "{}");
  rememberPickedFile("second.json", "{}");
  assert.equal(readPickedFile("first.json"), null);
  assert.deepEqual(readPickedFile("second.json"), { name: "second.json", text: "{}" });
});

test("unknown pick names read as stale", () => {
  assert.equal(readPickedFile("never-picked.json"), null);
});

test("nothing has been saved before the first download", () => {
  assert.equal(lastSavedTextFile(), null);
});
