import assert from "node:assert/strict";
import { test } from "vitest";
import {
  embeddableFolders,
  resolveFolderPath,
} from "../../../../../packages/renderer-core/src/database/embed";
import { databaseState } from "./fixtures";

test("a folder path resolves from the root, ignoring case and stray slashes", () => {
  const state = databaseState();
  assert.equal(resolveFolderPath(state, "Projects"), "projects");
  assert.equal(resolveFolderPath(state, "projects/archive"), "archive");
  assert.equal(resolveFolderPath(state, " /Projects/ Archive/ "), "archive");
});

test("paths that name no live folder resolve to nothing", () => {
  const state = databaseState();
  assert.equal(resolveFolderPath(state, ""), null);
  assert.equal(resolveFolderPath(state, "Archive"), null);
  assert.equal(resolveFolderPath(state, "Projects/Alpha"), null);
  assert.equal(resolveFolderPath(state, "Journal"), null);
});

test("embeddable folders list paths in tree order without the journal", () => {
  assert.deepEqual(embeddableFolders(databaseState()), [
    { id: "projects", path: "Projects" },
    { id: "archive", path: "Projects/Archive" },
  ]);
});
