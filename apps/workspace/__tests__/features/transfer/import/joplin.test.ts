import assert from "node:assert/strict";
import test from "node:test";
import type { MarkdownTree } from "../../../../src/features/transfer/export/markdown-transfer-model";
import { detectImportSource } from "../../../../src/features/transfer/import/model";
import { importSources } from "../../../../src/features/transfer/import/sources";
import { joplinSource } from "../../../../src/features/transfer/import/sources/joplin";

const NOTE_ID = "1b2c3d4e5f60718293a4b5c6d7e8f901";
const FOLDER_ID = "a0b1c2d3e4f5061728394a5b6c7d8e9f";
const CHILD_FOLDER_ID = "b1c2d3e4f5a60718293a4b5c6d7e8f90";
const TAG_ID = "c1d2e3f4a5b60718293a4b5c6d7e8f90";
const LINK_ID = "d2e3f4a5b6c70819203a4b5c6d7e8f91";
const RESOURCE_ID = "9f8e7d6c5b4a39281706f5e4d3c2b1a0";

function tree(partial: Partial<MarkdownTree>): MarkdownTree {
  return { directories: [], files: [], skipped: 0, ...partial };
}

function item(
  id: string,
  type: string,
  title: string,
  body: string,
  metadata: Record<string, string> = {},
): { relativePath: string; content: string } {
  const head = title.length > 0 ? `${title}\n\n` : "";
  const bodyPart = body.length > 0 ? `${body}\n\n` : "";
  const lines = Object.entries({
    id,
    created_time: "2026-01-02T10:00:00.000Z",
    updated_time: "2026-01-03T11:30:00.000Z",
    ...metadata,
    type_: type,
  })
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
  return { relativePath: `${id}.md`, content: `${head}${bodyPart}${lines}` };
}

test("joplin raw items detect as joplin", () => {
  const input = tree({
    files: [item(NOTE_ID, "1", "Note", "Body", { parent_id: "" })],
  });
  assert.equal(joplinSource.detect(input), 0.95);
  assert.equal(detectImportSource(importSources, input)?.id, "joplin");
});

test("plain markdown does not detect as joplin", () => {
  const input = tree({
    files: [{ relativePath: "Note.md", content: "# Note" }],
  });
  assert.equal(joplinSource.detect(input), 0);
});

test("notes land in reconstructed folder paths with tags and timestamps", () => {
  const bundle = joplinSource.parse(
    tree({
      files: [
        item(FOLDER_ID, "2", "Personal", "", { parent_id: "" }),
        item(CHILD_FOLDER_ID, "2", "Reading", "", { parent_id: FOLDER_ID }),
        item(NOTE_ID, "1", "Reading list", "Books to read.", {
          parent_id: CHILD_FOLDER_ID,
        }),
        item(TAG_ID, "5", "books", "", { parent_id: "" }),
        item(LINK_ID, "6", "", "", { note_id: NOTE_ID, tag_id: TAG_ID }),
      ],
    }),
  );
  assert.equal(bundle.notes.length, 1);
  const note = bundle.notes[0];
  assert.equal(note?.relativePath, "Personal/Reading/Reading list.md");
  assert.equal(note?.markdown, "Books to read.");
  assert.deepEqual(note?.tags, ["books"]);
  assert.equal(note?.createdAt, Date.parse("2026-01-02T10:00:00.000Z"));
  assert.equal(note?.modifiedAt, Date.parse("2026-01-03T11:30:00.000Z"));
  assert.deepEqual(bundle.directories, ["Personal", "Personal/Reading"]);
});

test("resource links rewrite to files under resources/", () => {
  const bundle = joplinSource.parse(
    tree({
      assets: [`resources/${RESOURCE_ID}.png`],
      files: [
        item(
          NOTE_ID,
          "1",
          "Note",
          `An image ![cover](:/${RESOURCE_ID}) and a missing [file](:/${"0".repeat(32)}).`,
          { parent_id: "" },
        ),
      ],
    }),
  );
  const note = bundle.notes[0];
  assert.ok(note?.markdown.includes(`![cover](resources/${RESOURCE_ID}.png)`));
  assert.ok(note?.markdown.includes("file (attachment)"));
  assert.ok(
    bundle.warnings.some((warning) => warning.message.includes("attachment")),
  );
});

test("deleted notes are skipped with a warning", () => {
  const bundle = joplinSource.parse(
    tree({
      files: [
        item(NOTE_ID, "1", "Gone", "Body", {
          parent_id: "",
          deleted_time: "1767225600000",
        }),
      ],
    }),
  );
  assert.equal(bundle.notes.length, 0);
  assert.ok(bundle.warnings.some((warning) => warning.message.includes("deleted")));
});
