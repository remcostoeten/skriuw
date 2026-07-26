import assert from "node:assert/strict";
import test from "node:test";
import type { MarkdownTree } from "../../src/export/markdown-transfer-model";
import { detectImportSource } from "../../src/import/model";
import { planImportBundle } from "../../src/import/plan";
import { importSources } from "../../src/import/sources";
import { bearSource } from "../../src/import/sources/bear";
import { markdownSource } from "../../src/import/sources/markdown";
import { plainTextSource } from "../../src/import/sources/plain-text";
import { simplenoteSource } from "../../src/import/sources/simplenote";

function tree(partial: Partial<MarkdownTree>): MarkdownTree {
  return { directories: [], files: [], skipped: 0, ...partial };
}

function sequentialIds(): () => string {
  let next = 0;
  return () => {
    next += 1;
    return `id-${next}`;
  };
}

test("markdown directory detects as markdown source", () => {
  const source = detectImportSource(
    importSources,
    tree({ files: [{ relativePath: "Note.md", content: "# Note" }] }),
  );
  assert.equal(source?.id, "markdown");
});

test("simplenote export outranks the markdown fallback", () => {
  const source = detectImportSource(
    importSources,
    tree({
      files: [
        { relativePath: "Note.md", content: "# Note" },
        {
          relativePath: "notes.json",
          content: JSON.stringify({ activeNotes: [{ content: "Hello" }] }),
        },
      ],
    }),
  );
  assert.equal(source?.id, "simplenote");
});

test("textbundle files detect as bear and hoist notes out of bundles", () => {
  const input = tree({
    directories: ["Groceries.textbundle", "Groceries.textbundle/assets"],
    files: [
      {
        relativePath: "Groceries.textbundle/text.md",
        content: "# Groceries\n![photo](assets/list.png)",
      },
    ],
  });
  const source = detectImportSource(importSources, input);
  assert.equal(source?.id, "bear");
  const bundle = bearSource.parse(input);
  assert.equal(bundle.notes.length, 1);
  assert.equal(bundle.notes[0].relativePath, "Groceries.md");
  assert.equal(bundle.notes[0].title, "Groceries");
  assert.ok(bundle.notes[0].markdown.includes("](Groceries.textbundle/assets/list.png)"));
  assert.deepEqual(bundle.directories, []);
});

test("plain text only directory detects as plain text", () => {
  const input = tree({
    files: [{ relativePath: "todo.txt", content: "milk\neggs" }],
  });
  const source = detectImportSource(importSources, input);
  assert.equal(source?.id, "plain-text");
  const bundle = plainTextSource.parse(input);
  assert.equal(bundle.notes[0].title, "todo");
});

test("empty tree detects nothing", () => {
  assert.equal(detectImportSource(importSources, tree({})), null);
});

test("simplenote parse maps content, titles, timestamps, and skips trashed", () => {
  const bundle = simplenoteSource.parse(
    tree({
      files: [
        {
          relativePath: "notes.json",
          content: JSON.stringify({
            activeNotes: [
              {
                content: "# Shopping\nmilk",
                creationDate: "2024-01-02T03:04:05.000Z",
                lastModified: "2024-02-02T03:04:05.000Z",
                tags: ["errands"],
              },
              { content: "Shopping\nagain" },
            ],
            trashedNotes: [{ content: "old" }],
          }),
        },
      ],
    }),
  );
  assert.equal(bundle.notes.length, 2);
  assert.equal(bundle.notes[0].title, "Shopping");
  assert.equal(bundle.notes[0].relativePath, "Shopping.md");
  assert.equal(bundle.notes[1].relativePath, "Shopping (2).md");
  assert.equal(bundle.notes[0].createdAt, Date.parse("2024-01-02T03:04:05.000Z"));
  assert.ok(bundle.warnings.some((warning) => warning.message.includes("1 trashed")));
  assert.ok(bundle.warnings.some((warning) => warning.message.includes("tags are not imported")));
});

test("markdown adapter ignores textbundle internals and json files", () => {
  const bundle = markdownSource.parse(
    tree({
      directories: ["Docs", "X.textbundle"],
      files: [
        { relativePath: "Docs/Note.md", content: "# Note" },
        { relativePath: "X.textbundle/text.md", content: "# Bundled" },
        { relativePath: "notes.json", content: "{}" },
      ],
    }),
  );
  assert.deepEqual(
    bundle.notes.map((note) => note.relativePath),
    ["Docs/Note.md"],
  );
  assert.deepEqual(bundle.directories, ["Docs"]);
});

test("planImportBundle builds folders from note paths and keeps adapter titles", () => {
  const plan = planImportBundle(
    {
      sourceId: "markdown",
      sourceLabel: "Markdown",
      directories: ["Empty"],
      notes: [
        { relativePath: "Docs/Guide.md", title: "Guide", markdown: "# Guide\nBody" },
        { relativePath: "Root.md", title: "Custom Title", markdown: "text" },
      ],
      warnings: [],
    },
    123,
    sequentialIds(),
  );
  assert.equal(plan.noteCount, 2);
  assert.equal(plan.folderCount, 2);
  const folders = plan.operations.filter((operation) => operation.type === "create_folder");
  assert.deepEqual(
    folders.map((operation) => operation.type === "create_folder" && operation.title),
    ["Docs", "Empty"],
  );
  const noteOperations = plan.operations.filter(
    (operation) => operation.type === "create_note",
  );
  assert.equal(noteOperations.length, 2);
  const guide = noteOperations.find(
    (operation) => operation.type === "create_note" && operation.title === "Guide",
  );
  assert.ok(guide);
  const custom = noteOperations.find(
    (operation) => operation.type === "create_note" && operation.title === "Custom Title",
  );
  assert.ok(custom);
});
