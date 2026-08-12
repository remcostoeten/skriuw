import assert from "node:assert/strict";
import test from "node:test";
import { extractReferences, referencesEqual } from "../../../src/features/references/extract";
import { referenceDocumentJson } from "./fixtures";

test("extract walks nested content and preserves document order", () => {
  const documentJson = {
    type: "doc",
    content: [
      {
        type: "blockquote",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "tag_ref", attrs: { id: "tag-1", label: "alpha" } },
              { type: "text", text: "then" },
              { type: "mention_ref", attrs: { kind: "person", id: "person-1", label: "Ada" } },
            ],
          },
        ],
      },
      {
        type: "paragraph",
        content: [{ type: "mention_ref", attrs: { kind: "note", id: "note-9", label: "Nine" } }],
      },
    ],
  };
  assert.deepEqual(extractReferences(documentJson), [
    { kind: "tag", targetId: "tag-1" },
    { kind: "person", targetId: "person-1" },
    { kind: "note", targetId: "note-9" },
  ]);
});

test("extract deduplicates repeated references and rejects malformed tokens", () => {
  const documentJson = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "tag_ref", attrs: { id: "tag-1", label: "alpha" } },
          { type: "tag_ref", attrs: { id: "tag-1", label: "alpha" } },
          { type: "tag_ref", attrs: { id: "", label: "empty" } },
          { type: "tag_ref" },
          { type: "mention_ref", attrs: { kind: "team", id: "team-1", label: "nope" } },
        ],
      },
    ],
  };
  assert.deepEqual(extractReferences(documentJson), [{ kind: "tag", targetId: "tag-1" }]);
});

test("extract handles primitive and empty documents", () => {
  assert.deepEqual(extractReferences(null), []);
  assert.deepEqual(extractReferences("text"), []);
  assert.deepEqual(extractReferences(referenceDocumentJson([])), []);
});

test("referencesEqual compares by position and identity", () => {
  const references = extractReferences(
    referenceDocumentJson([
      { kind: "tag", targetId: "tag-1" },
      { kind: "note", targetId: "note-1" },
    ]),
  );
  assert.equal(referencesEqual(references, [...references]), true);
  assert.equal(referencesEqual(references, [...references].reverse()), false);
  assert.equal(referencesEqual(references, references.slice(0, 1)), false);
});
