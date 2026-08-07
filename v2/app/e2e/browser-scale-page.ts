import type { WorkspaceOperationEnvelope } from "../src/contracts/workspace";
import {
  applyWorkspaceOperations,
  bootstrapWorkspace,
  closeWorkspaceWindow,
  searchWorkspace,
} from "../src/bridge/commands";

const BATCH_LIMIT = 64;
const NOTES_PER_FOLDER = 100;

type SeedReport = {
  initializeMs: number;
  initialNodes: number;
  totalOperations: number;
  batches: number;
  applyMs: number;
};

type MeasureReport = {
  coldBootstrapMs: number;
  warmBootstrapMs: number;
  nodes: number;
  documents: number;
  searchMs: number;
  searchHits: number;
};

declare global {
  interface Window {
    browserScaleE2e: {
      seed(total: number): Promise<SeedReport>;
      measure(): Promise<MeasureReport>;
    };
  }
}

function envelope(
  operation: WorkspaceOperationEnvelope["operation"],
): WorkspaceOperationEnvelope {
  return { protocolVersion: 1, operation };
}

function buildOperations(total: number, run: string): WorkspaceOperationEnvelope[] {
  const at = Date.now();
  const folderCount = Math.max(1, Math.ceil(total / NOTES_PER_FOLDER));
  const operations: WorkspaceOperationEnvelope[] = [];
  for (let folder = 0; folder < folderCount; folder += 1) {
    operations.push(
      envelope({
        type: "create_folder",
        id: `scale-${run}-folder-${folder}`,
        title: `Scale folder ${folder}`,
        placement: { parentId: null, position: { type: "last" } },
        at,
      }),
    );
  }
  for (let note = 0; note < total; note += 1) {
    const markdown = `scale note ${note} covering topic-${note % 37} in run ${run}`;
    operations.push(
      envelope({
        type: "create_note",
        id: `scale-${run}-note-${note}`,
        title: `Scale note ${note}`,
        placement: {
          parentId: `scale-${run}-folder-${Math.floor(note / NOTES_PER_FOLDER)}`,
          position: { type: "last" },
        },
        documentJson: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: markdown }] }],
        },
        markdown,
        at,
      }),
    );
  }
  return operations;
}

window.browserScaleE2e = {
  async seed(total) {
    const initializeStart = performance.now();
    const before = await bootstrapWorkspace();
    const initializeMs = performance.now() - initializeStart;

    const run = crypto.randomUUID().slice(0, 8);
    const operations = buildOperations(total, run);
    const applyStart = performance.now();
    let batches = 0;
    for (let offset = 0; offset < operations.length; offset += BATCH_LIMIT) {
      await applyWorkspaceOperations(operations.slice(offset, offset + BATCH_LIMIT));
      batches += 1;
    }
    const applyMs = performance.now() - applyStart;
    await closeWorkspaceWindow();
    return {
      initializeMs,
      initialNodes: before.nodes.length,
      totalOperations: operations.length,
      batches,
      applyMs,
    };
  },

  async measure() {
    const coldStart = performance.now();
    const snapshot = await bootstrapWorkspace();
    const coldBootstrapMs = performance.now() - coldStart;

    const warmStart = performance.now();
    await bootstrapWorkspace();
    const warmBootstrapMs = performance.now() - warmStart;

    const searchStart = performance.now();
    const hits = await searchWorkspace("topic-11", 20);
    const searchMs = performance.now() - searchStart;

    return {
      coldBootstrapMs,
      warmBootstrapMs,
      nodes: snapshot.nodes.length,
      documents: snapshot.documents.length,
      searchMs,
      searchHits: hits.length,
    };
  },
};
