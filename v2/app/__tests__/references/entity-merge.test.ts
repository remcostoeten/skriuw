import assert from "node:assert/strict";
import test from "node:test";
import { createInitialState } from "../../src/store/store";
import { buildMergeSaveDocuments } from "../../src/references/entity-merge";
import { extractReferences } from "../../src/references/extract";
import { referenceFixture } from "./fixtures";

function fixtureState() {
  const { snapshot, references } = referenceFixture();
  return createInitialState(snapshot, undefined, references);
}

test("merge rewrites every referencing note onto the target tag", () => {
  const state = fixtureState();
  const operations = buildMergeSaveDocuments(state, "tag", "tag-alpha", "tag-beta");

  const noteIds = operations.map((operation) =>
    operation.type === "save_document" ? operation.noteId : null,
  );
  assert.deepEqual(new Set(noteIds), new Set(["note-b", "note-c"]));

  for (const operation of operations) {
    assert.equal(operation.type, "save_document");
    if (operation.type !== "save_document") {
      continue;
    }
    const references = extractReferences(operation.documentJson);
    assert.ok(references.some((reference) => reference.targetId === "tag-beta"));
    assert.ok(!references.some((reference) => reference.targetId === "tag-alpha"));
    assert.equal(operation.expectedRevision, 1);
  }
});

test("merge relabels the rewritten reference to the target name", () => {
  const state = fixtureState();
  const [operation] = buildMergeSaveDocuments(state, "tag", "tag-alpha", "tag-beta");
  assert.ok(operation && operation.type === "save_document");
  const json = JSON.stringify(operation.documentJson);
  assert.ok(json.includes('"label":"beta"'));
});

test("merge into an unknown or identical target yields no operations", () => {
  const state = fixtureState();
  assert.deepEqual(buildMergeSaveDocuments(state, "tag", "tag-alpha", "tag-alpha"), []);
  assert.deepEqual(buildMergeSaveDocuments(state, "tag", "tag-alpha", "tag-missing"), []);
});

test("merge leaves unrelated references in the document untouched", () => {
  const state = fixtureState();
  const [noteB] = buildMergeSaveDocuments(state, "tag", "tag-alpha", "tag-beta").filter(
    (operation) => operation.type === "save_document" && operation.noteId === "note-b",
  );
  assert.ok(noteB && noteB.type === "save_document");
  const references = extractReferences(noteB.documentJson);
  assert.ok(references.some((reference) => reference.targetId === "note-a"));
  assert.ok(references.some((reference) => reference.targetId === "person-ada"));
});
