import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "vitest";
import { repositoryPath } from "../../../../../../support/paths";
import { planStarterWorkspace } from "@/features/onboarding/starter/plan";
import { withBooksBoard } from "@/features/onboarding/starter/books";
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

test("a fresh visitor opens on the Welcome note, which embeds the Books board", () => {
  const welcome = readFileSync(join(root, "Welcome.md"), "utf8");
  let id = 0;
  const plan = planStarterWorkspace(
    {
      directories: ["Books"],
      files: [{ relativePath: "Welcome.md", content: welcome }, ...files],
      skipped: 0,
    },
    1_000,
    () => `seed-${++id}`,
  );
  const welcomeNote = plan.notes.find((note) => note.relativePath === "Welcome.md");
  assert.ok(welcomeNote);
  assert.equal(plan.welcomeNoteId, welcomeNote.id);
  const saved = plan.contentOperations.find(
    (operation) => operation.type === "save_document" && operation.noteId === welcomeNote.id,
  );
  assert.ok(saved?.type === "save_document");
  assert.match(saved.markdown, /```database\nBooks\n```/);
});
