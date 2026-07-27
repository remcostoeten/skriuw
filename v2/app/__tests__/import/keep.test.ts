import assert from "node:assert/strict";
import test from "node:test";
import type { MarkdownTree } from "../../src/export/markdown-transfer-model";
import { detectImportSource } from "../../src/import/model";
import { importSources } from "../../src/import/sources";
import { keepSource } from "../../src/import/sources/keep";

function tree(partial: Partial<MarkdownTree>): MarkdownTree {
  return { directories: [], files: [], skipped: 0, ...partial };
}

function keepNote(overrides: Record<string, unknown>): string {
  return JSON.stringify({
    color: "DEFAULT",
    isTrashed: false,
    isPinned: false,
    isArchived: false,
    userEditedTimestampUsec: 1767225600000000,
    createdTimestampUsec: 1767139200000000,
    ...overrides,
  });
}

test("keep takeout json detects as google keep", () => {
  const input = tree({
    directories: ["Keep"],
    files: [
      {
        relativePath: "Keep/Note.json",
        content: keepNote({ title: "Note", textContent: "Hello" }),
      },
    ],
  });
  assert.equal(keepSource.detect(input), 0.95);
  assert.equal(detectImportSource(importSources, input)?.id, "keep");
});

test("json without keep markers does not detect", () => {
  const input = tree({
    files: [{ relativePath: "data.json", content: '{"textContent":"x"}' }],
  });
  assert.equal(keepSource.detect(input), 0);
});

test("list notes become checkbox markdown with labels as tags", () => {
  const bundle = keepSource.parse(
    tree({
      directories: ["Keep"],
      files: [
        {
          relativePath: "Keep/Groceries.json",
          content: keepNote({
            title: "Groceries",
            isPinned: true,
            listContent: [
              { text: "Milk", isChecked: true },
              { text: "Bread", isChecked: false },
            ],
            labels: [{ name: "errands" }],
          }),
        },
      ],
    }),
  );
  const note = bundle.notes[0];
  assert.equal(note?.title, "Groceries");
  assert.equal(note?.relativePath, "Keep/Groceries.md");
  assert.equal(note?.markdown, "- [x] Milk\n- [ ] Bread");
  assert.deepEqual(note?.tags, ["errands"]);
  assert.deepEqual(note?.properties, [
    { name: "Pinned", value: { type: "checkbox", value: true } },
  ]);
  assert.equal(note?.modifiedAt, 1767225600000);
  assert.equal(note?.createdAt, 1767139200000);
  assert.deepEqual(bundle.directories, ["Keep"]);
});

test("trashed notes are skipped with a warning", () => {
  const bundle = keepSource.parse(
    tree({
      files: [
        {
          relativePath: "Keep/Old.json",
          content: keepNote({ title: "Old", textContent: "x", isTrashed: true }),
        },
      ],
    }),
  );
  assert.equal(bundle.notes.length, 0);
  assert.ok(bundle.warnings.some((warning) => warning.message.includes("trashed")));
});

test("attachments resolve against assets and weblink annotations append", () => {
  const bundle = keepSource.parse(
    tree({
      directories: ["Keep"],
      assets: ["Keep/photo.png"],
      files: [
        {
          relativePath: "Keep/Trip.json",
          content: keepNote({
            title: "Trip",
            textContent: "Notes",
            color: "BLUE",
            isArchived: true,
            attachments: [
              { filePath: "photo.png", mimetype: "image/png" },
              { filePath: "missing.png", mimetype: "image/png" },
            ],
            annotations: [
              {
                source: "WEBLINK",
                url: "https://example.com/guide",
                title: "Guide",
              },
            ],
          }),
        },
      ],
    }),
  );
  const note = bundle.notes[0];
  assert.ok(note?.markdown.includes("![photo.png](photo.png)"));
  assert.ok(note?.markdown.includes("- [Guide](https://example.com/guide)"));
  assert.ok(!note?.markdown.includes("missing.png"));
  assert.deepEqual(note?.properties, [
    { name: "Archived", value: { type: "checkbox", value: true } },
    { name: "Color", value: { type: "text", value: "BLUE" } },
  ]);
  assert.ok(
    bundle.warnings.some((warning) => warning.message.includes("attachment")),
  );
});

test("untitled text notes take their title from content", () => {
  const bundle = keepSource.parse(
    tree({
      files: [
        {
          relativePath: "Keep/note.json",
          content: keepNote({ textContent: "First line here\nRest" }),
        },
      ],
    }),
  );
  assert.equal(bundle.notes[0]?.title, "First line here");
});
