import assert from "node:assert/strict";
import test from "node:test";
import * as commands from "../../src/bridge/commands";

test("bridge command functions exist and are exported", () => {
  assert.equal(typeof commands.bootstrapWorkspace, "function");
  assert.equal(typeof commands.loadSidebarExpansion, "function");
  assert.equal(typeof commands.saveSidebarExpansion, "function");
  assert.equal(typeof commands.applyWorkspaceOperations, "function");
  assert.equal(typeof commands.closeWorkspaceWindow, "function");
  assert.equal(typeof commands.searchWorkspace, "function");
  assert.equal(typeof commands.readHistoryVersion, "function");
  assert.equal(typeof commands.workspaceStoragePath, "function");
  assert.equal(typeof commands.revealWorkspaceStorage, "function");
  assert.equal(typeof commands.openExternalUrl, "function");
  assert.equal(typeof commands.exportWorkspaceArchive, "function");
  assert.equal(typeof commands.importWorkspaceArchive, "function");
  assert.equal(typeof commands.createWorkspaceBackup, "function");
  assert.equal(typeof commands.listWorkspaceRecovery, "function");
  assert.equal(typeof commands.restoreWorkspaceBackup, "function");
  assert.equal(typeof commands.cancelWorkspaceMaintenance, "function");
  assert.equal(typeof commands.pickDirectory, "function");
  assert.equal(typeof commands.exportMarkdownTree, "function");
  assert.equal(typeof commands.readMarkdownTree, "function");
});
