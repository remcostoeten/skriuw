import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  hasLosslessMarkdownDocument,
  parseProductMarkdown,
  requiresLosslessMarkdownSource,
  serializeProductMarkdown,
} from "../../src/editor/schema";
import { planMarkdownImport } from "../../src/export/markdown-transfer-model";

const root = fileURLToPath(new URL("../../src/starter/notes", import.meta.url));

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const full = join(directory, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const files = walk(root)
  .sort()
  .map((path) => ({
    relativePath: relative(root, path).split(/[\\/]/).join("/"),
    content: readFileSync(path, "utf8"),
  }));

test("the starter vault ships notes in nested folders", () => {
  assert.equal(files.length, 5);
  assert.ok(files.some((file) => file.relativePath.includes("/")));
});

test("every starter note parses into rich blocks", () => {
  for (const file of files) {
    const document = parseProductMarkdown(file.content);
    const json = document.toJSON() as { content?: { type: string }[] };
    const kinds = new Set((json.content ?? []).map((block) => block.type));
    assert.ok(kinds.size > 1, `${file.relativePath} parsed as a single block kind`);
    assert.ok(kinds.has("heading"), `${file.relativePath} lost its heading`);
  }
});

test("starter notes open in the rich editor rather than raw markdown", () => {
  for (const file of files) {
    const json = parseProductMarkdown(file.content).toJSON();
    assert.equal(
      requiresLosslessMarkdownSource(file.content) || hasLosslessMarkdownDocument(json),
      false,
      `${file.relativePath} would open as raw markdown`,
    );
  }
});

test("starter notes survive a save without being rewritten", () => {
  for (const file of files) {
    const once = serializeProductMarkdown(parseProductMarkdown(file.content));
    const twice = serializeProductMarkdown(parseProductMarkdown(once));
    assert.equal(twice, once, `${file.relativePath} is not round-trip stable`);
  }
});

test("every wikilink between starter notes resolves", () => {
  let id = 0;
  const plan = planMarkdownImport(
    {
      directories: ["Guides", "Ideas", "Projects"],
      files,
      skipped: 0,
    },
    0,
    () => `note-${++id}`,
  );
  assert.equal(plan.unresolvedReferences, 0);
  assert.equal(plan.notes.length, files.length);
});
