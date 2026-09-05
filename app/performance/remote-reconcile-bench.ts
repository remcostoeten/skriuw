import { performance } from "node:perf_hooks";
import type { WorkspaceNode, WorkspaceSnapshot } from "../src/contracts/workspace";
import { createInitialState, createRendererStore } from "../src/store/store";

const NOTE_COUNT = Number(process.argv[2] ?? 5_000);
const ROUNDS = Number(process.argv[3] ?? 50);

function node(id: string, rank: number, parentId: string | null): WorkspaceNode {
  return {
    id,
    kind: "note",
    parentId,
    rank,
    title: `Note ${id}`,
    icon: null,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    pinnedAt: null,
  };
}

function body(text: string) {
  return {
    type: "doc",
    content: Array.from({ length: 20 }, (_, index) => ({
      type: "paragraph",
      content: [{ type: "text", text: `${text} paragraph ${index}` }],
    })),
  };
}

function snapshot(revisionOf: (index: number) => number, changedIds: ReadonlySet<string>): WorkspaceSnapshot {
  const nodes: WorkspaceNode[] = [];
  const documents: WorkspaceSnapshot["documents"] = [];
  for (let index = 0; index < NOTE_COUNT; index += 1) {
    const id = `n${index}`;
    nodes.push(node(id, index, index % 50 === 0 ? null : `n${index - (index % 50)}`));
    const text = changedIds.has(id) ? `remote ${id}` : `local ${id}`;
    documents.push({
      noteId: id,
      documentJson: body(text),
      markdown: text,
      revision: revisionOf(index),
      wordCount: 60,
    });
  }
  for (let index = 0; index < NOTE_COUNT; index += 50) {
    const folder = nodes[index]!;
    nodes[index] = { ...folder, kind: "folder" };
  }
  return {
    protocolVersion: 1,
    activeNoteId: "n1",
    nodes,
    documents,
    historyHeaders: [],
    settings: {
      settingsVersion: 1,
      theme: "system",
      compactSidebar: false,
      showPageIcons: true,
      reduceMotion: false,
      rememberLastNote: true,
      editorFont: "sans",
      editorLineHeight: "1.6",
      showLineNumbers: false,
      editorPlaceholder: "",
    },
    tags: [],
    people: [],
    references: [],
  };
}

function percentile(samples: number[], fraction: number): number {
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
}

function report(label: string, samples: number[]): void {
  console.log(
    `${label}: p50 ${percentile(samples, 0.5).toFixed(2)} ms, p95 ${percentile(samples, 0.95).toFixed(2)} ms, max ${Math.max(...samples).toFixed(2)} ms (${samples.length} rounds)`,
  );
}

const base = snapshot(() => 1, new Set());
const store = createRendererStore(createInitialState(base));
let subscriberWakeups = 0;
store.subscribe((state) => state.nodes, () => {
  subscriberWakeups += 1;
});
store.subscribe((state) => state.documents, () => {
  subscriberWakeups += 1;
});

const changed = new Set(["n7", "n8", "n9"]);
const deltaSnapshot = snapshot((index) => (changed.has(`n${index}`) ? 2 : 1), changed);
const delta = {
  documents: deltaSnapshot.documents.filter((document) => changed.has(document.noteId)),
  nodes: deltaSnapshot.nodes.filter((entry) => changed.has(entry.id)),
};

const deltaSamples: number[] = [];
for (let round = 0; round < ROUNDS; round += 1) {
  const bumped = {
    documents: delta.documents.map((document) => ({ ...document, revision: 2 + round })),
    nodes: delta.nodes,
  };
  const started = performance.now();
  store.applyRemoteDocuments(bumped);
  deltaSamples.push(performance.now() - started);
}
report(`applyRemoteDocuments (${NOTE_COUNT} notes, 3 changed)`, deltaSamples);

const replaceSamples: number[] = [];
for (let round = 0; round < ROUNDS; round += 1) {
  const fresh = snapshot((index) => (changed.has(`n${index}`) ? 100 + round : 1), changed);
  const started = performance.now();
  store.replaceFromSnapshot(fresh);
  replaceSamples.push(performance.now() - started);
}
report(`replaceFromSnapshot, unchanged tree (${NOTE_COUNT} notes)`, replaceSamples);

const structuralSamples: number[] = [];
for (let round = 0; round < ROUNDS; round += 1) {
  const fresh = snapshot((index) => (changed.has(`n${index}`) ? 200 + round : 1), changed);
  fresh.nodes[3] = { ...fresh.nodes[3]!, title: `Moved ${round}` };
  const started = performance.now();
  store.replaceFromSnapshot(fresh);
  structuralSamples.push(performance.now() - started);
}
report(`replaceFromSnapshot, one node retitled (${NOTE_COUNT} notes)`, structuralSamples);

const parseSamples: number[] = [];
for (let round = 0; round < ROUNDS; round += 1) {
  const started = performance.now();
  createInitialState(snapshot(() => 1, new Set()));
  parseSamples.push(performance.now() - started);
}
report(`createInitialState from a full snapshot (${NOTE_COUNT} notes)`, parseSamples);
console.log(`subscriber wake-ups across all rounds: ${subscriberWakeups}`);
