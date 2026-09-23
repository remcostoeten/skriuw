import assert from "node:assert/strict";
import { test } from "vitest";
import type { MarkdownTree } from "@/features/transfer/export/markdown-transfer-model";
import { detectImportSource } from "@/features/transfer/import/model";
import { importSources } from "../../../../../../../apps/workspace/src/features/transfer/import/sources";
import { obsidianSource } from "@/features/transfer/import/sources/obsidian";

function tree(partial: Partial<MarkdownTree>): MarkdownTree {
  return { directories: [], files: [], assets: [], skipped: 0, ...partial };
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
          content: '---\ntags: ["#work", home]\nmeta:\n  nested: true\n---\ntext',
        },
      ],
    }),
  );
  assert.deepEqual(bundle.notes[0].tags, ["work", "home"]);
  assert.equal(bundle.notes[0].properties, undefined);
  assert.equal(
    bundle.notes[0].markdown,
    '---\ntags: ["#work", home]\nmeta:\n  nested: true\n---\ntext',
  );
  assert.ok(bundle.warnings.some((warning) => warning.message.includes("too complex")));
});

test("frontmatter parser handles YAML quoting, comments, and multiline scalars", () => {
  const bundle = obsidianSource.parse(
    tree({
      files: [
        {
          relativePath: "Note.md",
          content: [
            "---",
            'quoted: "a: b, c"',
            "enabled: TRUE",
            "topics:",
            '  - "one, two"',
            "  - three # comment",
            "summary: |",
            "  first",
            "  second",
            "---",
            "body",
          ].join("\n"),
        },
      ],
    }),
  );
  assert.equal(bundle.notes[0].markdown, "body");
  assert.deepEqual(bundle.notes[0].properties, [
    { name: "quoted", value: { type: "text", value: "a: b, c" } },
    { name: "enabled", value: { type: "checkbox", value: true } },
    { name: "topics", value: { type: "list", values: ["one, two", "three"] } },
    { name: "summary", value: { type: "text", value: "first\nsecond\n" } },
  ]);
  assert.equal(bundle.warnings.length, 0);
});

test("invalid or duplicate YAML remains exact raw Markdown", () => {
  const source = "---\nstatus: first\nstatus: second\n---\nbody";
  const bundle = obsidianSource.parse(
    tree({ files: [{ relativePath: "Note.md", content: source }] }),
  );
  assert.equal(bundle.notes[0].markdown, source);
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

test("relative image paths win and ambiguous basenames stay as source text", () => {
  const bundle = obsidianSource.parse(
    tree({
      directories: ["Notes", "Notes/assets", "Other"],
      assets: ["Notes/assets/pic.png", "Other/pic.png"],
      files: [
        {
          relativePath: "Notes/Exact.md",
          content: "![[assets/pic.png]]",
        },
        {
          relativePath: "Notes/Ambiguous.md",
          content: "![[pic.png]]",
        },
      ],
    }),
  );
  assert.equal(
    bundle.notes.find((note) => note.title === "Exact")?.markdown,
    "![pic.png](assets/pic.png)",
  );
  assert.equal(bundle.notes.find((note) => note.title === "Ambiguous")?.markdown, "![[pic.png]]");
  assert.ok(bundle.warnings.some((warning) => warning.message.includes("multiple vault files")));
});

test("unresolved image embeds stay as text and note embeds become links", () => {
  const bundle = obsidianSource.parse(
    tree({
      files: [{ relativePath: "Note.md", content: "![[missing.png]]\n![[Other Note]]" }],
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
