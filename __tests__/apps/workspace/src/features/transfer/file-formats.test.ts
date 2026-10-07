import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import {
  convertFormatsToMarkdown,
  fileFormatForPath,
  fileFormats,
} from "@/features/transfer/file-formats";
import { detectImportSource } from "@/features/transfer/import/parsing/bundle";
import { importSources } from "@/features/transfer/import/sources/registry";

test("covers exactly the extensions the desktop shell registers", () => {
  const configUrl = new URL(
    "../../../../../../apps/workspace/src-tauri/tauri.conf.json",
    import.meta.url,
  );
  const config: { bundle: { fileAssociations: { ext: string[] }[] } } = JSON.parse(
    readFileSync(configUrl, "utf8"),
  );
  const registered = config.bundle.fileAssociations.flatMap((association) => association.ext);
  const covered = fileFormats.flatMap((format) => format.extensions);
  assert.deepEqual([...covered].sort(), [...registered].sort());
});

test("picks a format by extension, ignoring case", () => {
  assert.equal(fileFormatForPath("/home/me/Docs/Intro.MDX")?.id, "mdx");
  assert.equal(fileFormatForPath("C:\\notes\\todo.markdown")?.id, "markdown");
  assert.equal(fileFormatForPath("/home/me/list.txt")?.id, "text");
  assert.equal(fileFormatForPath("/home/me/sheet.xlsx"), null);
  assert.equal(fileFormatForPath("/home/me/README"), null);
});

test("converts MDX to Markdown and renames it so every source reads it", () => {
  const tree = convertFormatsToMarkdown({
    directories: [],
    files: [
      { relativePath: "guide.mdx", content: "<Note>\n  Hello\n</Note>", modifiedAt: 5 },
      { relativePath: "readme.md", content: "# Readme" },
      { relativePath: "readme.mdx", content: "Other" },
      { relativePath: "list.txt", content: "plain" },
    ],
    skipped: 0,
  });
  assert.deepEqual(
    tree.files.map((file) => file.relativePath),
    ["guide.md", "readme.md", "readme (mdx).md", "list.txt"],
  );
  assert.equal(tree.files[0]?.content, "```mdx\n<Note>\n```\n\nHello\n\n```mdx\n</Note>\n```");
  assert.equal(tree.files[0]?.modifiedAt, 5);
  assert.equal(tree.files[3]?.content, "plain");
  assert.equal(detectImportSource(importSources, tree)?.id, "markdown");
});
