import assert from "node:assert/strict";
import { test } from "vitest";
import type { WorkspaceOperation } from "@skriuw/renderer-core/contracts/workspace";
import {
  JOURNAL_DATE_PROPERTY_ID,
  JOURNAL_MOOD_PROPERTY_ID,
  JOURNAL_ROOT_ID,
} from "@/features/journal/model";
import type { ImportBundle } from "@/features/transfer/import/parsing/bundle";
import { planImportBundle } from "@/features/transfer/import/planning/bundle";
import { applyImportGrouping } from "@/features/transfer/import/planning/grouping";

function sequentialIds(): () => string {
  let next = 0;
  return () => {
    next += 1;
    return `id-${next}`;
  };
}

const vault: ImportBundle = {
  sourceId: "skriuw-v1",
  sourceLabel: "Skriuw v1",
  directories: ["Journal", "Ideas"],
  notes: [
    {
      relativePath: "Journal/2026-06-24.md",
      title: "Untitled",
      markdown: "First day",
      journalDay: { dateKey: "2026-06-24", mood: "rough" },
    },
    {
      relativePath: "Journal/2026-07-08.md",
      title: "Untitled",
      markdown: "Second day",
      journalDay: { dateKey: "2026-07-08", mood: null },
    },
    { relativePath: "Ideas/Reading.md", title: "Reading", markdown: "Books" },
  ],
  warnings: [],
};

function createdNotes(operations: readonly WorkspaceOperation[]) {
  return operations.flatMap((operation) => (operation.type === "create_note" ? [operation] : []));
}

function propertiesOf(operations: readonly WorkspaceOperation[], noteId: string) {
  return operations.flatMap((operation) =>
    operation.type === "set_note_property" && operation.property.noteId === noteId
      ? [operation.property]
      : [],
  );
}

test("journal days move under the journal folder with their date and mood", () => {
  const plan = planImportBundle(vault, 1_000, sequentialIds(), [], [], {
    journalRoot: "present",
  });
  const notes = createdNotes(plan.operations);
  const days = notes.filter((note) => note.placement.parentId === JOURNAL_ROOT_ID);
  assert.equal(days.length, 2);
  assert.equal(plan.journalDays, 2);
  assert.equal(plan.journalConflicts, 0);
  const first = days.find((note) => note.title === "Untitled");
  const properties = propertiesOf(plan.operations, first?.id ?? "");
  assert.deepEqual(
    properties.map((property) => [property.id, property.value]),
    [
      [JOURNAL_DATE_PROPERTY_ID, { valueVersion: 1, type: "date", value: "2026-06-24" }],
      [JOURNAL_MOOD_PROPERTY_ID, { valueVersion: 1, type: "select", value: "rough" }],
    ],
  );
  assert.deepEqual(plan.journalRootOperations, []);
});

test("a folder holding only journal days is not created", () => {
  const plan = planImportBundle(vault, 1_000, sequentialIds(), [], [], {
    journalRoot: "present",
  });
  const folders = plan.operations.flatMap((operation) =>
    operation.type === "create_folder" ? [operation.title] : [],
  );
  assert.deepEqual(folders, ["Ideas"]);
  assert.equal(plan.folderCount, 1);
});

test("a date the journal already holds, or one claimed earlier in the import, stays a note", () => {
  const plan = planImportBundle(
    {
      ...vault,
      notes: [
        ...vault.notes,
        {
          relativePath: "Journal/2026-07-08 copy.md",
          title: "Untitled",
          markdown: "Same day again",
          journalDay: { dateKey: "2026-07-08", mood: null },
        },
      ],
    },
    1_000,
    sequentialIds(),
    [],
    [],
    { journalRoot: "present", existingJournalDates: new Set(["2026-06-24"]) },
  );
  assert.equal(plan.journalDays, 1);
  assert.equal(plan.journalConflicts, 2);
  const folders = plan.operations.flatMap((operation) =>
    operation.type === "create_folder" ? [operation.title] : [],
  );
  assert.ok(folders.includes("Journal"));
});

test("a missing journal folder is created and a trashed one restored", () => {
  const missing = planImportBundle(vault, 1_000, sequentialIds(), [], [], {
    journalRoot: "missing",
  });
  assert.deepEqual(
    missing.journalRootOperations.map((operation) => operation.type),
    ["create_folder"],
  );
  const trashed = planImportBundle(vault, 1_000, sequentialIds(), [], [], {
    journalRoot: "trashed",
  });
  assert.deepEqual(
    trashed.journalRootOperations.map((operation) => operation.type),
    ["restore_subtree"],
  );
});

test("destination grouping leaves journal days in the journal", () => {
  const plan = planImportBundle(vault, 1_000, sequentialIds(), [], [], {
    journalRoot: "missing",
  });
  applyImportGrouping(
    plan.operations,
    { destinationFolderId: "imports", sourceFolderLabel: "Skriuw v1", groupByYear: false },
    1_000,
    sequentialIds(),
  );
  const parents = createdNotes(plan.operations).map((note) => note.placement.parentId);
  assert.equal(parents.filter((parent) => parent === JOURNAL_ROOT_ID).length, 2);
  assert.ok(
    plan.journalRootOperations.every(
      (operation) => operation.type === "create_folder" && operation.placement.parentId === null,
    ),
  );
});
