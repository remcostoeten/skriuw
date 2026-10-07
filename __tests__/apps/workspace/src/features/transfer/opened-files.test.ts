import assert from "node:assert/strict";
import { test } from "vitest";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { bindOpenedFiles, OPENED_FILES_EVENT } from "@/features/transfer/opened-files";
import type { WorkspaceSnapshot } from "@skriuw/renderer-core/contracts/workspace";
import { createInitialState, createRendererStore } from "@skriuw/renderer-core/store/store";

const snapshot: WorkspaceSnapshot = {
  protocolVersion: 1,
  nodes: [],
  documents: [],
  settings: {
    settingsVersion: 1,
    theme: "midnight",
    compactSidebar: false,
    showPageIcons: true,
    rememberLastNote: true,
    editorFont: "inter",
    editorLineHeight: "comfortable",
    showLineNumbers: true,
    editorPlaceholder: "Start writing...",
  },
  activeNoteId: null,
  historyHeaders: [],
};

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

test("opens queued launch files and files forwarded later, in order", async () => {
  const store = createRendererStore(createInitialState(snapshot));
  const queued = [["/a.md", "/b.mdx"], ["/c.md"]];
  const opened: string[] = [];
  let wake: (() => void) | null = null;
  const unlisten: UnlistenFn = () => {};
  await bindOpenedFiles(
    store,
    async (event, handler) => {
      assert.equal(event, OPENED_FILES_EVENT);
      wake = handler;
      return unlisten;
    },
    async () => queued.shift() ?? [],
    async (_store, path) => {
      opened.push(path);
      return null;
    },
  );
  assert.deepEqual(opened, ["/a.md", "/b.mdx"]);
  wake?.();
  await flush();
  assert.deepEqual(opened, ["/a.md", "/b.mdx", "/c.md"]);
});
