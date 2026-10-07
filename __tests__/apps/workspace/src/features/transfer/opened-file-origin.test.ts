import assert from "node:assert/strict";
import { test } from "vitest";
import type {
  ProviderImportReceipt,
  WorkspaceOperation,
} from "@skriuw/renderer-core/contracts/workspace";
import {
  OPENED_FILE_PROVIDER,
  fileExtension,
  openedFileOrigin,
  toOpenedFileReceipts,
} from "@/features/transfer/opened-file-origin";
import { contentHash } from "@/features/transfer/import/parsing/bundle";

function receipt(provider: string, noteId: string, sourcePath: string): ProviderImportReceipt {
  return { provider, sourceKey: "key", sourcePath, noteId, importedAt: 1 };
}

test("finds the origin only for notes opened from the file manager", () => {
  const receipts = [
    receipt("markdown", "imported", "notes/todo.md"),
    receipt(OPENED_FILE_PROVIDER, "opened", "/home/me/Docs/Intro.MDX"),
  ];
  assert.equal(openedFileOrigin(receipts, "opened"), "/home/me/Docs/Intro.MDX");
  assert.equal(openedFileOrigin(receipts, "imported"), null);
  assert.equal(openedFileOrigin(receipts, "missing"), null);
});

test("reads the lowercase extension from the file name", () => {
  assert.equal(fileExtension("/home/me/Docs/Intro.MDX"), ".mdx");
  assert.equal(fileExtension("C:\\notes\\todo.md"), ".md");
  assert.equal(fileExtension("/home/me.d/README"), null);
  assert.equal(fileExtension("/home/me/.markdown"), null);
});

test("reports the path a moved file was last opened from", () => {
  const receipts = [
    { ...receipt(OPENED_FILE_PROVIDER, "opened", "/home/me/new/todo.md"), importedAt: 5 },
    { ...receipt(OPENED_FILE_PROVIDER, "opened", "/home/me/old/todo.md"), importedAt: 2 },
  ];
  assert.equal(openedFileOrigin(receipts, "opened"), "/home/me/new/todo.md");
});

test("rewrites only the import receipts, recording the file and note hashes", async () => {
  const rename: WorkspaceOperation = { type: "rename_node", id: "a", title: "A", at: 1 };
  const save: WorkspaceOperation = {
    type: "save_document",
    noteId: "a",
    documentJson: {},
    markdown: "Body",
    wordCount: 1,
    expectedRevision: 0,
    at: 1,
  };
  const [kept, rewritten] = await toOpenedFileReceipts(
    [rename, { type: "record_provider_import", receipt: receipt("markdown", "a", "todo.md") }],
    [save],
    { path: "/home/me/todo.md", formatId: "markdown", fileHash: "file-hash" },
  );
  assert.equal(kept, rename);
  assert.deepEqual(rewritten, {
    type: "record_provider_import",
    receipt: {
      ...receipt(OPENED_FILE_PROVIDER, "a", "/home/me/todo.md"),
      openedFile: {
        formatId: "markdown",
        fileHash: "file-hash",
        noteHash: await contentHash("Body"),
      },
    },
  });
});
