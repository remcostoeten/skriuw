import assert from "node:assert/strict";
import { test } from "vitest";
import type { WorkspaceSnapshot } from "@skriuw/renderer-core/contracts/workspace";
import { currentSnapshot, takeEarlyBootstrap } from "@/app/early-bootstrap";

function snapshot(activeNoteId: string): WorkspaceSnapshot {
  return {
    protocolVersion: 1,
    activeNoteId,
    nodes: [],
    documents: [],
    historyHeaders: [],
    settings: {
      settingsVersion: 1,
      theme: "system",
      compactSidebar: false,
      showPageIcons: true,
      rememberLastNote: true,
      editorFont: "sans",
      editorLineHeight: "1.6",
      showLineNumbers: false,
      editorPlaceholder: "Start writing",
      editorDefaultRawMode: false,
    },
  };
}

function countingBootstrap(result: WorkspaceSnapshot) {
  let calls = 0;
  return {
    calls: () => calls,
    read: async () => {
      calls += 1;
      return result;
    },
  };
}

test("an early snapshot read at the current epoch is used as is", async () => {
  const fresh = countingBootstrap(snapshot("fresh"));
  const early = Promise.resolve<[number, WorkspaceSnapshot]>([3, snapshot("early")]);

  const result = await currentSnapshot(early, async () => 3, fresh.read);

  assert.equal(result.activeNoteId, "early");
  assert.equal(fresh.calls(), 0);
});

test("a change published after the early read makes startup read the workspace again", async () => {
  const fresh = countingBootstrap(snapshot("fresh"));
  const early = Promise.resolve<[number, WorkspaceSnapshot]>([3, snapshot("early")]);

  const result = await currentSnapshot(early, async () => 4, fresh.read);

  assert.equal(result.activeNoteId, "fresh");
  assert.equal(fresh.calls(), 1);
});

test("a failed early read falls back to an ordinary bootstrap", async () => {
  const fresh = countingBootstrap(snapshot("fresh"));
  const early = Promise.reject<[number, WorkspaceSnapshot]>(new Error("early read failed"));

  const result = await currentSnapshot(early, async () => 3, fresh.read);

  assert.equal(result.activeNoteId, "fresh");
  assert.equal(fresh.calls(), 1);
});

test("the early reads are handed over once", () => {
  const early = {
    snapshot: Promise.resolve<[number, WorkspaceSnapshot]>([0, snapshot("early")]),
    sidebarExpansion: Promise.resolve(null),
    paneLayout: Promise.resolve(null),
  };
  globalThis.__SKRIUW_EARLY_BOOTSTRAP__ = early;

  assert.equal(takeEarlyBootstrap(), early);
  assert.equal(takeEarlyBootstrap(), null);
});
