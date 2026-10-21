import assert from "node:assert/strict";
import { test } from "vitest";
import {
  arrangeDatabase,
  rearrangeDatabase,
  type ArrangedSnapshot,
} from "../../../../../packages/renderer-core/src/database/arrange";
import {
  discoverColumns,
  sameColumns,
} from "../../../../../packages/renderer-core/src/database/columns";
import {
  defaultDatabaseView,
  type DatabaseView,
} from "../../../../../packages/renderer-core/src/database/config";
import { createDatabaseRowsSelector } from "../../../../../packages/renderer-core/src/database/rows";
import {
  createInitialState,
  createRendererStore,
} from "../../../../../packages/renderer-core/src/store/store";
import type { RendererState } from "../../../../../packages/renderer-core/src/store/types";
import {
  checkboxProperty,
  databaseSnapshot,
  node,
  numberProperty,
  selectProperty,
} from "./fixtures";

const NOTE_COUNT = 60;
const STATUS_LABELS = ["Todo", "Doing", "Done"];

function statusOptions(noteId: string) {
  return STATUS_LABELS.map((label) => ({
    id: `${noteId}_${label}`,
    label,
    color: "gray" as const,
  }));
}

function seeded(seed: number): () => number {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 2 ** 32;
  };
}

function bigSnapshot() {
  const base = databaseSnapshot();
  const ids = Array.from({ length: NOTE_COUNT }, (_, index) => `n${index}`);
  return {
    ...base,
    nodes: [
      node("projects", "folder", null, 1024, { title: "Projects" }),
      ...ids.map((id, index) =>
        node(id, "note", "projects", (index + 1) * 1024, { title: `Note ${id}` }),
      ),
    ],
    documents: ids.map((noteId) => ({
      noteId,
      documentJson: {},
      markdown: "",
      revision: 1,
      wordCount: 10,
    })),
    properties: ids.flatMap((id, index) => [
      selectProperty(id, "Status", statusOptions(id), `${id}_${STATUS_LABELS[index % 3]}`, 0),
      numberProperty(id, "Priority", index % 7, 1),
      checkboxProperty(id, "Shipped", index % 2 === 0, 2),
    ]),
  };
}

function bigState(): RendererState {
  return createInitialState(bigSnapshot());
}

const VIEWS: Partial<DatabaseView>[] = [
  {},
  { sorts: [{ column: "p:priority", direction: "asc" }] },
  {
    sorts: [
      { column: "p:status", direction: "desc" },
      { column: "p:priority", direction: "asc" },
    ],
  },
  { filters: [{ column: "p:status", operator: "is", value: "Doing" }] },
  {
    filters: [{ column: "p:priority", operator: "greater", value: "2" }],
    sorts: [{ column: "p:priority", direction: "desc" }],
  },
  { layout: "board", groupBy: "p:status", sorts: [{ column: "p:priority", direction: "asc" }] },
  {
    layout: "board",
    groupBy: "p:shipped",
    filters: [{ column: "p:status", operator: "not-empty", value: "" }],
  },
];

function editFor(state: RendererState, random: () => number) {
  const noteId = `n${Math.floor(random() * NOTE_COUNT)}`;
  const properties = state.propertiesByNoteId.get(noteId)!;
  const property = properties[Math.floor(random() * properties.length)]!;
  if (property.value.type === "select") {
    const option = property.options[Math.floor(random() * property.options.length)]!;
    return { ...property, value: { ...property.value, value: option.id } };
  }
  if (property.value.type === "number") {
    return { ...property, value: { ...property.value, value: Math.floor(random() * 7) } };
  }
  return { ...property, value: { ...property.value, value: random() < 0.5 } };
}

for (const [viewIndex, overrides] of VIEWS.entries()) {
  test(`incremental arrangement equals a full arrange across edits, view ${viewIndex}`, () => {
    const store = createRendererStore(bigState());
    const select = createDatabaseRowsSelector("projects", false);
    const view = { ...defaultDatabaseView("projects"), ...overrides };
    const random = seeded(viewIndex + 1);
    let previous: ArrangedSnapshot | null = null;

    for (let step = 0; step < 80; step += 1) {
      const state = store.getState();
      const rows = select(state);
      const discovered = discoverColumns(rows, false);
      const columns =
        previous !== null && sameColumns(previous.columns, discovered)
          ? previous.columns
          : discovered;
      const full = arrangeDatabase(rows, columns, view, "", state.people);
      const arranged =
        previous === null
          ? full
          : rearrangeDatabase(previous, rows, columns, view, "", state.people);
      assert.deepEqual(arranged, full, `step ${step}`);
      previous = { rows, columns, view, search: "", people: state.people, arranged };
      store.applyOperations([
        { type: "set_note_property", property: editFor(state, random), at: 100 + step },
      ]);
    }
  });
}

test("an unchanged arrangement is returned as is, and many changed rows fall back to a full arrange", () => {
  const state = bigState();
  const rows = createDatabaseRowsSelector("projects", false)(state);
  const columns = discoverColumns(rows, false);
  const view = defaultDatabaseView("projects");
  const arranged = arrangeDatabase(rows, columns, view, "", state.people);
  const snapshot: ArrangedSnapshot = {
    rows,
    columns,
    view,
    search: "",
    people: state.people,
    arranged,
  };
  assert.equal(rearrangeDatabase(snapshot, [...rows], columns, view, "", state.people), arranged);

  const touched = rows.map((row) => ({ ...row }));
  const result = rearrangeDatabase(snapshot, touched, columns, view, "", state.people);
  assert.deepEqual(result, arrangeDatabase(touched, columns, view, "", state.people));
  assert.notEqual(result, arranged);
});

test("a property edit rebuilds only the edited row, and a rename still rebuilds the scope", () => {
  const store = createRendererStore(bigState());
  const select = createDatabaseRowsSelector("projects", false);
  const before = select(store.getState());

  store.applyOperations([
    {
      type: "set_note_property",
      property: editFor(store.getState(), () => 0),
      at: 500,
    },
  ]);
  const edited = select(store.getState());
  assert.equal(edited.filter((row, index) => row !== before[index]).length, 1);
  assert.equal(edited[0]!.updatedAt, 500);

  store.applyOperations([{ type: "rename_node", id: "projects", title: "Renamed", at: 600 }]);
  const renamed = select(store.getState());
  assert.deepEqual(renamed, createDatabaseRowsSelector("projects", false)(store.getState()));
});
