import assert from "node:assert/strict";
import test from "node:test";
import type { MarkdownTree } from "../../../../src/features/transfer/export/markdown-transfer-model";
import { detectImportSource } from "../../../../src/features/transfer/import/model";
import { importSources } from "../../../../src/features/transfer/import/sources";
import { standardNotesSource } from "../../../../src/features/transfer/import/sources/standard-notes";

function tree(partial: Partial<MarkdownTree>): MarkdownTree {
  return { directories: [], files: [], skipped: 0, ...partial };
}

function backup(items: unknown[]): string {
  return JSON.stringify({ version: "004", items });
}

const NOTE_UUID = "11111111-1111-4111-8111-111111111111";

test("standard notes backup txt detects and outranks plain text", () => {
  const input = tree({
    files: [
      {
        relativePath: "Standard Notes Backup and Import File.txt",
        content: backup([
          {
            uuid: NOTE_UUID,
            content_type: "Note",
            content: { title: "A", text: "body" },
          },
        ]),
      },
    ],
  });
  assert.equal(standardNotesSource.detect(input), 0.95);
  assert.equal(detectImportSource(importSources, input)?.id, "standard-notes");
});

test("arbitrary json with items does not detect without content_type", () => {
  const input = tree({
    files: [{ relativePath: "data.json", content: '{"items":[{"a":1}]}' }],
  });
  assert.equal(standardNotesSource.detect(input), 0);
});

test("notes import with tags joined from tag references", () => {
  const bundle = standardNotesSource.parse(
    tree({
      files: [
        {
          relativePath: "backup.txt",
          content: backup([
            {
              uuid: NOTE_UUID,
              content_type: "Note",
              created_at: "2026-01-05T08:00:00.000Z",
              updated_at: "2026-01-06T09:15:00.000Z",
              content: { title: "Morning pages", text: "Three pages." },
            },
            {
              uuid: "33333333-3333-4333-8333-333333333333",
              content_type: "Tag",
              content: {
                title: "journal",
                references: [{ uuid: NOTE_UUID, content_type: "Note" }],
              },
            },
          ]),
        },
      ],
    }),
  );
  assert.equal(bundle.notes.length, 1);
  const note = bundle.notes[0];
  assert.equal(note?.title, "Morning pages");
  assert.equal(note?.markdown, "Three pages.");
  assert.deepEqual(note?.tags, ["journal"]);
  assert.equal(note?.createdAt, Date.parse("2026-01-05T08:00:00.000Z"));
  assert.equal(note?.modifiedAt, Date.parse("2026-01-06T09:15:00.000Z"));
  assert.equal(note?.relativePath, "Morning pages.md");
});

test("trashed and encrypted items are skipped with warnings", () => {
  const bundle = standardNotesSource.parse(
    tree({
      files: [
        {
          relativePath: "backup.txt",
          content: backup([
            {
              uuid: NOTE_UUID,
              content_type: "Note",
              content: { title: "Trash", text: "x", trashed: true },
            },
            {
              uuid: "44444444-4444-4444-8444-444444444444",
              content_type: "Note",
              content: "004:encryptedpayload",
              enc_item_key: "004:key",
            },
          ]),
        },
      ],
    }),
  );
  assert.equal(bundle.notes.length, 0);
  assert.ok(bundle.warnings.some((warning) => warning.message.includes("trashed")));
  assert.ok(
    bundle.warnings.some(
      (warning) =>
        warning.message.includes("encrypted") && warning.severity === "error",
    ),
  );
});

test("untitled notes fall back to first line then numbered titles", () => {
  const bundle = standardNotesSource.parse(
    tree({
      files: [
        {
          relativePath: "backup.txt",
          content: backup([
            {
              uuid: NOTE_UUID,
              content_type: "Note",
              content: { text: "First line\nmore" },
            },
            {
              uuid: "55555555-5555-4555-8555-555555555555",
              content_type: "Note",
              content: { text: "" },
            },
          ]),
        },
      ],
    }),
  );
  assert.equal(bundle.notes[0]?.title, "First line");
  assert.equal(bundle.notes[1]?.title, "Untitled 2");
});
