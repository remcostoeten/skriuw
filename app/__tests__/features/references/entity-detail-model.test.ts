import assert from "node:assert/strict";
import test from "node:test";
import { createInitialState, createRendererStore } from "../../../src/store/store";
import {
  entityDetailEqual,
  findMentionSnippet,
  projectEntityDetail,
  type EntityDetail,
} from "../../../src/features/references/entity-detail-model";
import { referenceFixture } from "./fixtures";

function createFixtureStore() {
  const { snapshot, references } = referenceFixture();
  return createRendererStore(createInitialState(snapshot, undefined, references));
}

function paragraph(content: readonly unknown[]): unknown {
  return { type: "doc", content: [{ type: "paragraph", content }] };
}

function tagRef(id: string, label: string): unknown {
  return { type: "tag_ref", attrs: { id, label } };
}

function personRef(id: string, label: string): unknown {
  return { type: "mention_ref", attrs: { kind: "person", id, label } };
}

test("projectEntityDetail lists every referencing note with a snippet", () => {
  const store = createFixtureStore();
  const detail = projectEntityDetail(store.getState(), "tag", "tag-alpha");
  assert.deepEqual(
    detail.notes.map((note) => note.title),
    ["Beta note", "Gamma note"],
  );
  assert.equal(detail.notes[0]?.snippet, "body@note-a#tag-alpha$person-ada");
});

test("projectEntityDetail counts co-occurring entities and excludes note links and itself", () => {
  const store = createFixtureStore();
  const detail = projectEntityDetail(store.getState(), "tag", "tag-alpha");
  assert.deepEqual(
    detail.related.map((entry) => [entry.kind, entry.id, entry.sharedNotes]),
    [["person", "person-ada", 1]],
  );
});

test("projectEntityDetail returns empty results for an unreferenced entity", () => {
  const store = createFixtureStore();
  const detail = projectEntityDetail(store.getState(), "tag", "tag-beta");
  assert.deepEqual(detail.notes, []);
  assert.deepEqual(detail.related, []);
});

test("findMentionSnippet renders the mention the way the editor shows it", () => {
  const document = paragraph([
    { type: "text", text: "Shipped with " },
    tagRef("tag-1", "design"),
    { type: "text", text: " and " },
    personRef("person-1", "Ada"),
  ]);
  assert.equal(findMentionSnippet(document, "tag", "tag-1"), "Shipped with #design and $Ada");
  assert.equal(findMentionSnippet(document, "person", "person-1"), "Shipped with #design and $Ada");
});

test("findMentionSnippet elides a long paragraph around the mention", () => {
  const filler = "lorem ipsum dolor sit amet ".repeat(12);
  const document = paragraph([
    { type: "text", text: filler },
    tagRef("tag-1", "design"),
    { type: "text", text: ` ${filler}` },
  ]);
  const snippet = findMentionSnippet(document, "tag", "tag-1");
  assert.ok(snippet !== null);
  assert.ok(snippet.startsWith("…"));
  assert.ok(snippet.endsWith("…"));
  assert.ok(snippet.includes("#design"));
  assert.ok(snippet.length < 200);
});

test("findMentionSnippet descends into nested blocks and collapses whitespace", () => {
  const document = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "unrelated" }] },
      {
        type: "bullet_list",
        content: [
          {
            type: "list_item",
            content: [
              {
                type: "paragraph",
                content: [
                  { type: "text", text: "owned\n  by " },
                  personRef("person-1", "Ada"),
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  assert.equal(findMentionSnippet(document, "person", "person-1"), "owned by $Ada");
});

test("findMentionSnippet returns null when the document holds no matching reference", () => {
  const document = paragraph([{ type: "text", text: "no references here" }]);
  assert.equal(findMentionSnippet(document, "tag", "tag-1"), null);
});

test("entityDetailEqual distinguishes snippet and co-occurrence changes", () => {
  const base: EntityDetail = {
    notes: [{ noteId: "n1", title: "One", updatedAt: 4, snippet: "a" }],
    related: [
      { kind: "tag", id: "t1", name: "one", color: null, initials: null, sharedNotes: 2 },
    ],
  };
  assert.equal(entityDetailEqual(base, structuredClone(base)), true);
  assert.equal(
    entityDetailEqual(base, {
      ...base,
      notes: [{ ...base.notes[0]!, snippet: "b" }],
    }),
    false,
  );
  assert.equal(
    entityDetailEqual(base, {
      ...base,
      related: [{ ...base.related[0]!, sharedNotes: 3 }],
    }),
    false,
  );
});
