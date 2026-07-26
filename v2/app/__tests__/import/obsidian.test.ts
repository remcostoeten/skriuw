import assert from "node:assert/strict";
import test from "node:test";
import type { MarkdownTree } from "../../src/export/markdown-transfer-model";
import { detectImportSource } from "../../src/import/model";
import { planImportBundle } from "../../src/import/plan";
import { importSources } from "../../src/import/sources";
import { obsidianSource } from "../../src/import/sources/obsidian";

function tree(partial: Partial<MarkdownTree>): MarkdownTree {
  return { directories: [], files: [], assets: [], skipped: 0, ...partial };
}

function sequentialIds(): () => string {
  let next = 0;
  return () => {
    next += 1;
    return `id-${next}`;
  };
}

test("vault with frontmatter and wikilinks detects as obsidian", () => {
  const source = detectImportSource(
    importSources,
    tree({
      files: [
        { relativePath: "Daily.md", content: "---\nmood: good\n---\nSee [[Projects]]" },
        { relativePath: "Projects.md", content: "![[chart.png]]" },
      ],
    }),
  );
  assert.equal(source?.id, "obsidian");
});

test("plain markdown without obsidian signals stays markdown", () => {
  const source = detectImportSource(
    importSources,
    tree({
      files: [
        { relativePath: "A.md", content: "# A\nplain" },
        { relativePath: "B.md", content: "# B\nplain" },
      ],
    }),
  );
  assert.equal(source?.id, "markdown");
});

test("low signal density does not detect as obsidian", () => {
  const files = [
    { relativePath: "A.md", content: "plain" },
    { relativePath: "B.md", content: "plain" },
    { relativePath: "C.md", content: "plain" },
    { relativePath: "D.md", content: "See [[A]]" },
  ];
  assert.equal(obsidianSource.detect(tree({ files })), 0);
});

test("frontmatter is stripped and mapped to typed properties", () => {
  const bundle = obsidianSource.parse(
    tree({
      files: [
        {
          relativePath: "Note.md",
          content: [
            "---",
            "status: draft",
            "priority: 3",
            "published: false",
            "due: 2026-08-01",
            "source: https://example.com/page",
            "topics: [work, deep]",
            "aliases:",
            "  - Alt Name",
            "---",
            "# Body",
          ].join("\n"),
        },
      ],
    }),
  );
  const note = bundle.notes[0];
  assert.equal(note.markdown, "# Body");
  assert.deepEqual(note.properties, [
    { name: "status", value: { type: "text", value: "draft" } },
    { name: "priority", value: { type: "number", value: 3 } },
    { name: "published", value: { type: "checkbox", value: false } },
    { name: "due", value: { type: "date", value: "2026-08-01" } },
    { name: "source", value: { type: "url", value: "https://example.com/page" } },
    { name: "topics", value: { type: "list", values: ["work", "deep"] } },
    { name: "aliases", value: { type: "list", values: ["Alt Name"] } },
  ]);
});

test("frontmatter tags land on the note; nested keys warn", () => {
  const bundle = obsidianSource.parse(
    tree({
      files: [
        {
          relativePath: "Note.md",
          content: "---\ntags: [#work, home]\nmeta:\n  nested: true\n---\ntext",
        },
      ],
    }),
  );
  assert.deepEqual(bundle.notes[0].tags, ["work", "home"]);
  assert.equal(bundle.notes[0].properties, undefined);
  assert.ok(bundle.warnings.some((warning) => warning.message.includes("too complex")));
});

test("image embeds resolve against vault assets by basename", () => {
  const bundle = obsidianSource.parse(
    tree({
      directories: ["Notes", "attachments"],
      assets: ["attachments/pic 1.png"],
      files: [
        {
          relativePath: "Notes/Note.md",
          content: "![[pic 1.png]] and ![[pic 1.png|photo]] and ![[pic 1.png|400]]",
        },
      ],
    }),
  );
  assert.equal(
    bundle.notes[0].markdown,
    "![pic 1.png](../attachments/pic%201.png) and ![photo](../attachments/pic%201.png) and ![pic 1.png](../attachments/pic%201.png)",
  );
  assert.deepEqual(bundle.directories, ["Notes"]);
});

test("unresolved image embeds stay as text and note embeds become links", () => {
  const bundle = obsidianSource.parse(
    tree({
      files: [
        { relativePath: "Note.md", content: "![[missing.png]]\n![[Other Note]]" },
      ],
    }),
  );
  assert.equal(bundle.notes[0].markdown, "![[missing.png]]\n[[Other Note]]");
  assert.ok(bundle.warnings.some((warning) => warning.message.includes("matched no file")));
  assert.ok(bundle.warnings.some((warning) => warning.message.includes("note embed")));
});

test("wikilinks pass through untouched for the planner", () => {
  const bundle = obsidianSource.parse(
    tree({ files: [{ relativePath: "Note.md", content: "See [[Projects]]" }] }),
  );
  assert.equal(bundle.notes[0].markdown, "See [[Projects]]");
});

test("planImportBundle emits set_note_property operations for adapter properties", () => {
  const plan = planImportBundle(
    {
      sourceId: "obsidian",
      sourceLabel: "Obsidian",
      directories: [],
      notes: [
        {
          relativePath: "Note.md",
          title: "Note",
          markdown: "body",
          properties: [
            { name: "status", value: { type: "text", value: "draft" } },
            { name: "topics", value: { type: "list", values: ["work", "deep"] } },
          ],
        },
      ],
      warnings: [],
    },
    123,
    sequentialIds(),
  );
  const noteOperation = plan.operations.find((operation) => operation.type === "create_note");
  assert.ok(noteOperation);
  const propertyOperations = plan.operations.filter(
    (operation) => operation.type === "set_note_property",
  );
  assert.equal(propertyOperations.length, 2);
  const [first, second] = propertyOperations;
  assert.ok(first.type === "set_note_property" && second.type === "set_note_property");
  assert.equal(first.property.noteId, noteOperation.id);
  assert.equal(first.property.name, "status");
  assert.equal(first.property.position, 0);
  assert.deepEqual(first.property.value, { valueVersion: 1, type: "text", value: "draft" });
  assert.deepEqual(first.property.options, []);
  assert.equal(second.property.name, "topics");
  assert.equal(second.property.position, 1);
  assert.equal(second.property.value.type, "multi-select");
  assert.deepEqual(
    second.property.options.map((option) => option.label),
    ["work", "deep"],
  );
  assert.ok(
    second.property.value.type === "multi-select" &&
      second.property.value.value.every((id) =>
        second.property.options.some((option) => option.id === id),
      ),
  );
  assert.equal(first.at, 123);
});
