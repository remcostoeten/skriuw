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

test("rewrites only the import receipts to the opened-file origin", () => {
  const rename: WorkspaceOperation = { type: "rename_node", id: "a", title: "A", at: 1 };
  const [kept, rewritten] = toOpenedFileReceipts(
    [rename, { type: "record_provider_import", receipt: receipt("markdown", "a", "todo.md") }],
    "/home/me/todo.md",
  );
  assert.equal(kept, rename);
  assert.deepEqual(rewritten, {
    type: "record_provider_import",
    receipt: receipt(OPENED_FILE_PROVIDER, "a", "/home/me/todo.md"),
  });
});
