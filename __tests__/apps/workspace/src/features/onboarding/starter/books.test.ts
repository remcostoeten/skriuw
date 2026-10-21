import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "vitest";
import { repositoryPath } from "../../../../../../support/paths";
import { planStarterWorkspace } from "@/features/onboarding/starter/plan";
import { booksLandingHash, withBooksBoard } from "@/features/onboarding/starter/books";
import { normalizeNotePropertyField } from "@skriuw/renderer-core/properties/value";
import { propertyColumnKey } from "@skriuw/renderer-core/database/columns";
import { readDatabaseView } from "@skriuw/renderer-core/database/config";

const root = repositoryPath("apps/workspace/src/features/onboarding/starter/content");
const books = join(root, "Books");

const files = readdirSync(books)
  .sort()
  .map((entry) => ({
    relativePath: `Books/${entry}`,
    content: readFileSync(join(books, entry), "utf8"),
  }));

function planBooks() {
  let id = 0;
  return planStarterWorkspace(
    { directories: ["Books"], files, skipped: 0 },
    1_000,
    () => `seed-${++id}`,
  );
}

test("every starter book carries valid status, author, genre, and rating properties", () => {
  const plan = planBooks();
  const properties = plan.propertyOperations.flatMap((operation) =>
    operation.type === "set_note_property" ? [operation.property] : [],
  );
  assert.equal(properties.length, files.length * 4);
  for (const note of plan.notes) {
    const owned = properties.filter((property) => property.noteId === note.id);
    assert.deepEqual(
      owned.map((property) => property.name),
      ["Status", "Author", "Genre", "Rating"],
      note.relativePath,
    );
    for (const property of owned) {
      assert.doesNotThrow(() => normalizeNotePropertyField(property), note.relativePath);
    }
    const status = owned[0];
    assert.ok(status?.value.type === "select" && status.value.value !== null);
  }
});

test("the starter Books folder opens as a board grouped by status", () => {
  const plan = planBooks();
  assert.ok(plan.booksFolderId !== null);
  const settings = withBooksBoard({}, plan.booksFolderId, 1_000);
  const read = readDatabaseView(settings["databaseViews"], plan.booksFolderId);
  assert.equal(read.problem, null);
  assert.equal(read.view.layout, "board");
  assert.equal(read.view.groupBy, propertyColumnKey("Status"));
});

test("a fresh visitor lands on the Books board unless they asked for another route", () => {
  assert.equal(booksLandingHash("", "folder-1"), "#/database/folder-1");
  assert.equal(booksLandingHash("#/", "folder-1"), "#/database/folder-1");
  assert.equal(booksLandingHash("#/tasks", "folder-1"), null);
  assert.equal(booksLandingHash("#/database/other", "folder-1"), null);
});
