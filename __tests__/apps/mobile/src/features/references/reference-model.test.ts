import assert from "node:assert/strict";
import { test } from "vitest";
import { demoSnapshot } from "@/shell/demo-workspace";
import { createInitialState } from "@skriuw/renderer-core/store/store";
import {
  referenceEntriesEqual,
  selectReferenceEntries,
} from "@/features/references/reference-model";

function stateWithReferences() {
  const snapshot = demoSnapshot();
  snapshot.tags = [
    {
      id: "tag-writing",
      name: "Writing",
      color: null,
      createdAt: 1,
      updatedAt: 1,
      createdIn: null,
    },
    {
      id: "tag-ideas",
      name: "Ideas",
      color: null,
      createdAt: 1,
      updatedAt: 1,
      createdIn: null,
    },
  ];
  snapshot.people = [
    {
      id: "person-ada",
      name: "Ada",
      initials: "A",
      color: null,
      note: null,
      createdAt: 1,
      updatedAt: 1,
      createdIn: null,
    },
  ];
  snapshot.references = [
    {
      noteId: "note-native-shell",
      targets: [
        { kind: "tag", targetId: "tag-writing" },
        { kind: "person", targetId: "person-ada" },
      ],
    },
    {
      noteId: "note-inbox",
      targets: [{ kind: "tag", targetId: "tag-writing" }],
    },
  ];
  return createInitialState(snapshot, undefined, {
    tags: snapshot.tags,
    people: snapshot.people,
    references: snapshot.references,
  });
}

test("reference entries are sorted and include available note counts", () => {
  const state = stateWithReferences();
  const tags = selectReferenceEntries("tag")(state);
  const people = selectReferenceEntries("person")(state);

  assert.deepEqual(
    tags.map((entry) => entry.name),
    ["Ideas", "Writing"],
  );
  assert.equal(tags[0]?.count, 0);
  assert.deepEqual(tags[1]?.notes, [
    { id: "note-inbox", title: "Inbox" },
    { id: "note-native-shell", title: "Native shell" },
  ]);
  assert.deepEqual(people[0]?.notes, [{ id: "note-native-shell", title: "Native shell" }]);
});

test("reference entry equality ignores new container identities", () => {
  const state = stateWithReferences();
  const first = selectReferenceEntries("tag")(state);
  const second = selectReferenceEntries("tag")(state);

  assert.notEqual(first, second);
  assert.equal(referenceEntriesEqual(first, second), true);
});
