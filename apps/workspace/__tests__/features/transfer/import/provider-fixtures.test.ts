import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import type { MarkdownTree } from "../../../../src/features/transfer/export/markdown-transfer-model";
import { bearSource } from "../../../../src/features/transfer/import/sources/bear";
import { notionSource } from "../../../../src/features/transfer/import/sources/notion";
import { obsidianSource } from "../../../../src/features/transfer/import/sources/obsidian";
import { simplenoteSource } from "../../../../src/features/transfer/import/sources/simplenote";
import { appleNotesSource } from "../../../../src/features/transfer/import/sources/apple-notes";
import { evernoteSource } from "../../../../src/features/transfer/import/sources/evernote";
import { joplinSource } from "../../../../src/features/transfer/import/sources/joplin";
import { keepSource } from "../../../../src/features/transfer/import/sources/keep";
import { standardNotesSource } from "../../../../src/features/transfer/import/sources/standard-notes";

const fixtures = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../fixtures/provider-import",
);

async function fixtureTree(name: string): Promise<MarkdownTree> {
  const root = resolve(fixtures, name);
  const directories: string[] = [];
  const files: MarkdownTree["files"] = [];
  const assets: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const path = resolve(directory, entry.name);
      const relativePath = relative(root, path).replaceAll("\\", "/");
      if (entry.isDirectory()) {
        directories.push(relativePath);
        await visit(path);
      } else if (/\.(md|markdown|txt|json|csv|enex)$/i.test(entry.name)) {
        files.push({ relativePath, content: await readFile(path, "utf8") });
      } else if (/\.(png|jpe?g|gif|webp)$/i.test(entry.name)) {
        assets.push(relativePath);
      }
    }
  }
  await visit(root);
  directories.sort();
  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  assets.sort();
  return { directories, files, assets, unsupported: [], skipped: 0 };
}

test("provider fixture corpus matches documented export shapes", async () => {
  const obsidian = await fixtureTree("obsidian");
  assert.equal(obsidianSource.detect(obsidian), 0.8);
  const obsidianBundle = obsidianSource.parse(obsidian);
  assert.equal(obsidianBundle.notes.length, 2);
  assert.deepEqual(obsidianBundle.notes[0]?.tags, ["migration"]);
  assert.equal(obsidianBundle.notes[0]?.properties?.[0]?.name, "status");

  const notion = notionSource.parse(await fixtureTree("notion"));
  assert.equal(notion.notes.length, 3);
  assert.ok(notion.notes.some((note) => note.title === "Ship importer"));
  assert.ok(notion.directories.includes("Tasks"));

  const bear = bearSource.parse(await fixtureTree("bear"));
  assert.equal(bear.notes.length, 1);
  assert.deepEqual(bear.notes[0]?.tags, ["export", "bear"]);
  assert.equal(bear.notes[0]?.createdAt, Date.parse("2026-07-20T10:00:00Z"));

  const simplenote = simplenoteSource.parse(await fixtureTree("simplenote"));
  assert.equal(simplenote.notes.length, 1);
  assert.ok(simplenote.warnings.some((warning) => warning.message.includes("trashed")));

  const apple = appleNotesSource.parse(await fixtureTree("apple-notes"));
  assert.equal(apple.notes.length, 1);
  assert.equal(apple.notes[0]?.title, "Apple Notes example");

  const evernote = evernoteSource.parse(await fixtureTree("evernote"));
  assert.equal(evernote.notes.length, 2);
  assert.deepEqual(evernote.notes[0]?.tags, ["work", "meetings"]);
  assert.ok(evernote.notes[0]?.markdown.includes("# Weekly sync"));
  assert.ok(evernote.notes[0]?.markdown.includes("[x] Draft announcement"));
  assert.ok(evernote.notes[1]?.markdown.includes("```\ngrep -rn TODO src/"));
  assert.ok(evernote.warnings.some((warning) => warning.message.includes("attachment")));

  const joplin = joplinSource.parse(await fixtureTree("joplin"));
  assert.equal(joplin.notes.length, 1);
  assert.equal(joplin.notes[0]?.relativePath, "Personal/Reading list.md");
  assert.deepEqual(joplin.notes[0]?.tags, ["books"]);
  assert.ok(
    joplin.notes[0]?.markdown.includes(
      "![cover](../resources/9f8e7d6c5b4a39281706f5e4d3c2b1a0.png)",
    ),
  );

  const keep = keepSource.parse(await fixtureTree("keep"));
  assert.equal(keep.notes.length, 2);
  assert.ok(keep.notes.some((note) => note.markdown.includes("- [x] Milk")));
  assert.ok(keep.warnings.some((warning) => warning.message.includes("trashed")));

  const standardNotes = standardNotesSource.parse(await fixtureTree("standard-notes"));
  assert.equal(standardNotes.notes.length, 1);
  assert.deepEqual(standardNotes.notes[0]?.tags, ["journal"]);
});
