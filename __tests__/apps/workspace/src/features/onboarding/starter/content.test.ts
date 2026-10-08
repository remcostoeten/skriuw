import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "vitest";
import { repositoryPath } from "../../../../../../support/paths";
import {
  hasLosslessMarkdownDocument,
  parseProductMarkdown,
  requiresLosslessMarkdownSource,
  serializeProductMarkdown,
} from "@/features/editor/schema";
import { planMarkdownImport } from "@/features/transfer/markdown";
import { planStarterWorkspace } from "@/features/onboarding/starter/plan";
import { promotedChecklistTaskLinks } from "@/features/editor/tasks";
import { dateKeyOf, shiftDay } from "@skriuw/renderer-core/journal/dates";

const root = repositoryPath("apps/workspace/src/features/onboarding/starter/content");

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
  assert.equal(files.length, 7);
  assert.ok(files.some((file) => file.relativePath.includes("/")));
});

test("fresh starter tasks link to their source and use today's calendar", () => {
  const at = new Date(2026, 11, 31, 23, 30).getTime();
  let id = 0;
  const plan = planStarterWorkspace(
    { directories: [], files, skipped: 0 },
    at,
    () => `seed-${++id}`,
  );
  const source = plan.contentOperations.find(
    (operation) => operation.type === "promote_checklist_task",
  );
  assert.ok(source?.type === "promote_checklist_task");
  const tasks = plan.contentOperations.flatMap((operation) =>
    operation.type === "promote_checklist_task" || operation.type === "create_task"
      ? [operation.task]
      : [],
  );
  assert.equal(tasks.length, 4);
  assert.deepEqual(
    tasks.map((task) => task.dueDate),
    [null, dateKeyOf(new Date(at)), shiftDay(dateKeyOf(new Date(at)), 1), null],
  );
  assert.equal(tasks[0]?.status, "done");
  assert.equal(tasks[1]?.status, "todo");
  const document = parseProductMarkdown(source.document.markdown);
  const links = promotedChecklistTaskLinks(document, source.document.noteId, at);
  assert.deepEqual(
    links.map((link) => link.taskId),
    tasks.map((task) => task.id),
  );
  assert.deepEqual(
    links.map((link) => link.dueDate),
    tasks.map((task) => task.dueDate),
  );
  assert.ok(!source.document.markdown.includes("{{"));
  assert.equal(plan.unresolvedReferences, 0);
  const ordinary = plan.contentOperations.filter((operation) => operation.type === "save_document");
  for (const operation of ordinary) {
    assert.equal(
      promotedChecklistTaskLinks(parseProductMarkdown(operation.markdown), operation.noteId, at)
        .length,
      0,
    );
  }
});

test("starter math includes portable inline and display equations", () => {
  const math = files.find((file) => file.relativePath === "Guides/Math.md");
  assert.ok(math);
  const document = parseProductMarkdown(math.content);
  let inline = 0;
  let blocks = 0;
  document.descendants((node) => {
    if (node.type.name === "math_inline") inline += 1;
    if (node.type.name === "math_block") blocks += 1;
  });
  assert.equal(inline, 3);
  assert.equal(blocks, 3);
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
