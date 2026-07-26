import assert from "node:assert/strict";
import test from "node:test";
import {
  entityFocusHash,
  noteHistoryHash,
  resolveAppRoute,
  resolveRouteFocus,
} from "../src/app-route";

test("trash has a dedicated hash route and unknown routes return to notes", () => {
  assert.equal(resolveAppRoute("#/trash"), "trash");
  assert.equal(resolveAppRoute("#/notes"), "notes");
  assert.equal(resolveAppRoute("#/trash/nested"), "notes");
});

test("tag and person routes accept a focused entity sub-path", () => {
  assert.equal(resolveAppRoute("#/tags"), "tags");
  assert.equal(resolveAppRoute("#/tags/tag-1"), "tags");
  assert.equal(resolveAppRoute("#/people/person-9"), "people");
});

test("resolveRouteFocus extracts the focused entity id", () => {
  assert.equal(resolveRouteFocus("#/tags/tag-1"), "tag-1");
  assert.equal(resolveRouteFocus("#/people/person-9"), "person-9");
  assert.equal(resolveRouteFocus("#/tags"), null);
  assert.equal(resolveRouteFocus("#/notes"), null);
});

test("entityFocusHash round-trips ids that need encoding", () => {
  const hash = entityFocusHash("person", "a/b c");
  assert.equal(resolveAppRoute(hash), "people");
  assert.equal(resolveRouteFocus(hash), "a/b c");
});

test("history routes carry the note id as the route focus", () => {
  const hash = noteHistoryHash("note-1/a");
  assert.equal(hash, "#/history/note-1%2Fa");
  assert.equal(resolveAppRoute(hash), "history");
  assert.equal(resolveRouteFocus(hash), "note-1/a");
  assert.equal(resolveAppRoute("#/history"), "notes");
});
