import assert from "node:assert/strict";
import { test } from "vitest";
import type { MarkdownTree } from "@/features/transfer/import/parsing/tree";
import { detectImportSource } from "@/features/transfer/import/parsing/bundle";
import { importSources } from "@/features/transfer/import/sources/registry";
import { skriuwV1Source } from "@/features/transfer/import/sources/skriuw-v1";

function tree(partial: Partial<MarkdownTree>): MarkdownTree {
  return { directories: [], files: [], assets: [], skipped: 0, ...partial };
}

const v1Note = [
  "---",
  'id: "47eb865d-b5ea-4f1f-9a8d-5a3577e7c441"',
  "tags: [work]",
  "properties: []",
  "sortOrder: 34",
  'preferredEditorMode: "block"',
  "createdAt: 1782344346725",
  "modifiedAt: 1784842328064",
  "---",
  "# Launch notes",
  "",
  "Met $[Eline](person://2e5e7611) at [35](mark://count/mark_0c43/35/orange) degrees.",
].join("\n");

const v1JournalDay = [
  "---",
  'id: "ce97865d-b11d-4fbe-966c-562c1fe90ce9"',
  'dateKey: "2026-06-24"',
  'mood: "rough"',
  "tags: []",
  "createdAt: 1782667183588",
  "updatedAt: 1782759741126",
  "---",
  "## A long day",
  "",
  "Body",
].join("\n");

test("a v1 vault outranks the Obsidian and Markdown sources", () => {
  const source = detectImportSource(
    importSources,
    tree({
      directories: ["Journal"],
      files: [
        { relativePath: "Launch notes.md", content: v1Note },
        { relativePath: "Journal/2026-06-24.md", content: v1JournalDay },
      ],
    }),
  );
  assert.equal(source?.id, "skriuw-v1");
});

test("files without v1 frontmatter do not detect as a v1 vault", () => {
  const input = tree({
    files: [
      { relativePath: "A.md", content: "---\nstatus: draft\n---\nBody" },
      { relativePath: "B.md", content: "# B" },
    ],
  });
  assert.equal(skriuwV1Source.detect(input), 0);
});

test("v1 notes drop their frontmatter and keep title, tags, times and plain mentions", () => {
  const [note] = skriuwV1Source.parse(
    tree({ files: [{ relativePath: "Launch notes.md", content: v1Note }] }),
  ).notes;
  assert.equal(note?.title, "Launch notes");
  assert.equal(note?.markdown, "Met Eline at 35 degrees.");
  assert.deepEqual(note?.tags, ["work"]);
  assert.equal(note?.createdAt, 1782344346725);
  assert.equal(note?.modifiedAt, 1784842328064);
  assert.equal(note?.journalDay, undefined);
});

test("v1 journal days carry their date and mood and keep their body intact", () => {
  const [day] = skriuwV1Source.parse(
    tree({ files: [{ relativePath: "Journal/2026-06-24.md", content: v1JournalDay }] }),
  ).notes;
  assert.deepEqual(day?.journalDay, { dateKey: "2026-06-24", mood: "rough" });
  assert.equal(day?.title, "Untitled");
  assert.equal(day?.markdown, "## A long day\n\nBody");
  assert.equal(day?.modifiedAt, 1782759741126);
});

test("an invalid date or unknown mood does not make a journal day", () => {
  const notes = skriuwV1Source.parse(
    tree({
      files: [
        { relativePath: "bad-date.md", content: '---\ndateKey: "2026-02-30"\n---\nBody' },
        {
          relativePath: "odd-mood.md",
          content: '---\ndateKey: "2026-07-01"\nmood: "ecstatic"\n---\nBody',
        },
      ],
    }),
  ).notes;
  assert.equal(notes[0]?.journalDay, undefined);
  assert.deepEqual(notes[1]?.journalDay, { dateKey: "2026-07-01", mood: null });
});
