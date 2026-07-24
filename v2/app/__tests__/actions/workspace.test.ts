import assert from "node:assert/strict";
import test from "node:test";
import * as workspaceActions from "../../src/actions/workspace";

test("workspace action exports exist and are functions", () => {
  assert.equal(typeof workspaceActions.commitReferenceOperations, "function");
  assert.equal(typeof workspaceActions.commitOperations, "function");
  assert.equal(typeof workspaceActions.createNote, "function");
  assert.equal(typeof workspaceActions.createLinkedNote, "function");
  assert.equal(typeof workspaceActions.createFolder, "function");
  assert.equal(typeof workspaceActions.renameNode, "function");
  assert.equal(typeof workspaceActions.trashSubtree, "function");
  assert.equal(typeof workspaceActions.trashSubtrees, "function");
  assert.equal(typeof workspaceActions.restoreSubtree, "function");
  assert.equal(typeof workspaceActions.purgeSubtree, "function");
  assert.equal(typeof workspaceActions.emptyTrash, "function");
  assert.equal(typeof workspaceActions.moveNode, "function");
  assert.equal(typeof workspaceActions.moveNodes, "function");
  assert.equal(typeof workspaceActions.restoreNoteVersion, "function");
  assert.equal(typeof workspaceActions.activateNote, "function");
});
