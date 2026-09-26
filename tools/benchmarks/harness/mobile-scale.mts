/**
 * Mobile shell scale measurement (`apps/docs/content/v2/specs/mobile-app.md`, R-P1 to R-P4).
 *
 * Drives the real mobile startup path — the shared renderer store, the tree
 * selectors the native rows subscribe through, and the editor host session
 * that owns the webview protocol — against the 1,000 and 5,000-note fixtures
 * from `apps/docs/content/v2/performance-contract.md`.
 *
 * ```bash
 * bun x tsx tools/benchmarks/harness/mobile-scale.mts --notes 1000
 * bun x tsx tools/benchmarks/harness/mobile-scale.mts --notes 5000
 * ```
 *
 * This is a host measurement on the shared TypeScript layer. It bounds the
 * work the shell does per interaction; it is not the reference-device verdict.
 * See `tools/benchmarks/harness/README.md`.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createMemoryBridge } from "../../../packages/renderer-core/src/bridge/memory-adapter";
import type { BridgePort } from "../../../packages/renderer-core/src/bridge/port";
import {
  envelope,
  WORKSPACE_PROTOCOL_VERSION,
  type WorkspaceDocument,
  type WorkspaceNode,
  type WorkspaceSettings,
  type WorkspaceSnapshot,
} from "../../../packages/renderer-core/src/contracts/workspace";
import {
  createInitialState,
  createRendererStore,
} from "../../../packages/renderer-core/src/store/store";
import type { RendererStore } from "../../../packages/renderer-core/src/store/types";
import { createEditorHostSession } from "../../../apps/mobile/src/editor/host-session";
import {
  EDITOR_PROTOCOL_VERSION,
  type HostToEditorMessage,
} from "../../../apps/mobile/src/editor/protocol";
import {
  idListsEqual,
  treeRowsEqual,
  treeRowSelector,
  visibleIdsSelector,
} from "../../../apps/mobile/src/shell/tree-model";

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW_DIR = join(HERE, "..", "raw");

const BASE_TIME = Date.UTC(2026, 8, 1);
const NOTES_PER_FOLDER = 25;
const ORDINARY_BLOCKS = 40;
/** The block fixtures the performance contract names, measured on the load path. */
const BLOCK_FIXTURES = [50, 500, 2000] as const;
/** One phone viewport of 44 pt tree rows over an 844 pt screen, plus overscan. */
const VISIBLE_ROWS = 20;
const SWITCHES = 100;
const TREE_TOGGLES = 100;
const KEYSTROKES = 60;

const SETTINGS: WorkspaceSettings = {
  settingsVersion: 1,
  theme: "midnight",
  compactSidebar: false,
  showPageIcons: true,
  reduceMotion: false,
  rememberLastNote: true,
  editorFont: "inter",
  editorLineHeight: "comfortable",
  showLineNumbers: true,
  editorPlaceholder: "Start writing...",
};

const WORDS = [
  "workspace",
  "note",
  "folder",
  "editor",
  "native",
  "bridge",
  "sqlite",
  "operation",
  "snapshot",
  "revision",
  "journal",
  "task",
  "tag",
  "person",
  "search",
  "index",
  "theme",
  "gesture",
  "sheet",
  "toolbar",
];

function deterministicWord(seed: number): string {
  return WORDS[seed % WORDS.length] ?? "note";
}

function paragraph(seed: number, words: number): string {
  const parts: string[] = [];
  for (let index = 0; index < words; index += 1) {
    parts.push(deterministicWord(seed + index * 7));
  }
  return parts.join(" ");
}

function documentOf(
  noteId: string,
  title: string,
  blocks: number,
  seed: number,
): WorkspaceDocument {
  const content: unknown[] = [
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: title }] },
  ];
  const lines: string[] = [`# ${title}`, ""];
  let wordCount = title.split(" ").length;
  for (let index = 0; index < blocks; index += 1) {
    const text = paragraph(seed + index * 13, 12);
    wordCount += 12;
    content.push({ type: "paragraph", content: [{ type: "text", text }] });
    lines.push(text, "");
  }
  return {
    noteId,
    documentJson: { type: "doc", content },
    markdown: lines.join("\n"),
    revision: 1,
    wordCount,
  };
}

function node(
  id: string,
  kind: WorkspaceNode["kind"],
  parentId: string | null,
  title: string,
  rank: number,
): WorkspaceNode {
  return {
    id,
    kind,
    parentId,
    rank,
    title,
    icon: null,
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
    deletedAt: null,
    pinnedAt: null,
  };
}

type Fixture = {
  snapshot: WorkspaceSnapshot;
  noteIds: string[];
  folderIds: string[];
  blockFixtureIds: Record<number, string>;
};

/**
 * A workspace of `notes` notes under a nested folder tree, plus one note per
 * block fixture so the editor load path is measured at 50, 500 and 2,000
 * blocks without inflating the whole snapshot.
 */
function buildFixture(notes: number): Fixture {
  const nodes: WorkspaceNode[] = [];
  const documents: WorkspaceDocument[] = [];
  const noteIds: string[] = [];
  const folderIds: string[] = [];
  const folderCount = Math.max(1, Math.ceil(notes / NOTES_PER_FOLDER));
  let rank = 0;

  for (let index = 0; index < folderCount; index += 1) {
    const id = `folder-${index}`;
    // Every fourth folder nests one level deeper, so the tree is not flat.
    const parentId = index > 0 && index % 4 !== 0 ? `folder-${index - (index % 4)}` : null;
    rank += 1024;
    nodes.push(node(id, "folder", parentId, `Folder ${index}`, rank));
    folderIds.push(id);
  }

  for (let index = 0; index < notes; index += 1) {
    const id = `note-${index}`;
    const parentId = `folder-${index % folderCount}`;
    rank += 1024;
    nodes.push(node(id, "note", parentId, `Note ${index}`, rank));
    documents.push(documentOf(id, `Note ${index}`, ORDINARY_BLOCKS, index));
    noteIds.push(id);
  }

  const blockFixtureIds: Record<number, string> = {};
  for (const blocks of BLOCK_FIXTURES) {
    const id = `note-blocks-${blocks}`;
    rank += 1024;
    nodes.push(node(id, "note", "folder-0", `Document of ${blocks} blocks`, rank));
    documents.push(documentOf(id, `Document of ${blocks} blocks`, blocks, blocks));
    blockFixtureIds[blocks] = id;
  }

  return {
    snapshot: {
      protocolVersion: WORKSPACE_PROTOCOL_VERSION,
      activeNoteId: noteIds[0] ?? null,
      nodes,
      documents,
      historyHeaders: [],
      settings: SETTINGS,
      tags: [],
      people: [],
      references: [],
    },
    noteIds,
    folderIds,
    blockFixtureIds,
  };
}

type Counter = { calls: number; byCommand: Record<string, number> };

/** Counts every bridge call so a navigation path can be proven to make none. */
function countingBridge(port: BridgePort, counter: Counter): BridgePort {
  return new Proxy(port, {
    get(target, property, receiver) {
      // oxlint-disable-next-line anti-slop/no-reflect-get -- a Proxy get trap must forward the receiver.
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function" || typeof property !== "string") {
        return value;
      }
      return (...args: unknown[]) => {
        counter.calls += 1;
        counter.byCommand[property] = (counter.byCommand[property] ?? 0) + 1;
        return (value as (...inner: unknown[]) => unknown).apply(target, args);
      };
    },
  }) as BridgePort;
}

type Samples = {
  count: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  mean: number;
  raw: number[];
};

function summarize(raw: number[]): Samples {
  const sorted = [...raw].sort((left, right) => left - right);
  function at(quantile: number) {
    return sorted[Math.min(sorted.length - 1, Math.floor(quantile * sorted.length))] ?? 0;
  }
  return {
    count: raw.length,
    p50: at(0.5),
    p95: at(0.95),
    p99: at(0.99),
    max: sorted[sorted.length - 1] ?? 0,
    mean: raw.reduce((total, value) => total + value, 0) / Math.max(1, raw.length),
    raw,
  };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function reportable(samples: Samples) {
  return {
    count: samples.count,
    p50: round(samples.p50),
    p95: round(samples.p95),
    p99: round(samples.p99),
    max: round(samples.max),
    mean: round(samples.mean),
  };
}

/** Subscribes the selectors one phone viewport of native rows holds. */
function subscribeViewport(store: RendererStore, ids: readonly string[]) {
  const disposers: (() => void)[] = [];
  let notifications = 0;
  disposers.push(
    store.subscribe(
      visibleIdsSelector,
      () => {
        notifications += 1;
      },
      idListsEqual,
    ),
  );
  for (const id of ids) {
    disposers.push(
      store.subscribe(
        treeRowSelector(id),
        () => {
          notifications += 1;
        },
        treeRowsEqual,
      ),
    );
  }
  return {
    read: () => notifications,
    reset: () => {
      notifications = 0;
    },
    dispose: () => {
      for (const dispose of disposers) dispose();
    },
  };
}

async function run(notes: number) {
  const fixture = buildFixture(notes);
  const counter: Counter = { calls: 0, byCommand: {} };
  const bridge = countingBridge(createMemoryBridge({ snapshot: fixture.snapshot }), counter);

  const bootstrapStart = performance.now();
  const snapshot = await bridge.bootstrapWorkspace();
  const expansion = await bridge.loadSidebarExpansion();
  const snapshotRead = performance.now() - bootstrapStart;

  const hydrateStart = performance.now();
  const store = createRendererStore(
    createInitialState(snapshot, expansion ?? undefined, {
      tags: snapshot.tags,
      people: snapshot.people,
      references: snapshot.references,
    }),
  );
  const hydrate = performance.now() - hydrateStart;

  const visible = store.getState().visibleIds.slice(0, VISIBLE_ROWS);
  const viewport = subscribeViewport(store, visible);

  const emitted: HostToEditorMessage[] = [];
  const failures: unknown[] = [];
  const host = createEditorHostSession({
    session: {
      store,
      bridge,
      reportFailure: (error) => {
        failures.push(error);
      },
    },
    send: (message) => emitted.push(message),
    openLink: () => {},
    theme: () => "midnight",
    showFailure: () => {},
  });
  host.receive({ v: EDITOR_PROTOCOL_VERSION, type: "ready" });

  // Cached note switching: the store update and the `load` the host composes
  // for the warm webview, with no bridge call in between (R-P1, R-P2).
  const afterStartupCalls = counter.calls;
  const startupCommands = { ...counter.byCommand };
  viewport.reset();
  const switchSamples: number[] = [];
  const switchTargets = Array.from(
    { length: SWITCHES },
    (_, index) => fixture.noteIds[(index * 37 + 1) % fixture.noteIds.length]!,
  );
  for (const noteId of switchTargets) {
    const before = emitted.length;
    const start = performance.now();
    store.setActiveNote(noteId);
    switchSamples.push(performance.now() - start);
    if (emitted.length === before) {
      throw new Error(`no load message for ${noteId}`);
    }
  }
  const navigationBridgeCalls = counter.calls - afterStartupCalls;
  const navigationNotifications = viewport.read();

  // Serializing the `load` message is the cost the Expo DOM bridge adds on
  // top of the store update, so it is measured separately per block fixture.
  const encode: Record<string, ReturnType<typeof reportable>> = {};
  for (const blocks of BLOCK_FIXTURES) {
    const noteId = fixture.blockFixtureIds[blocks]!;
    store.setActiveNote(noteId);
    const message = emitted[emitted.length - 1]!;
    const samples: number[] = [];
    let bytes = 0;
    for (let index = 0; index < 50; index += 1) {
      const start = performance.now();
      bytes = JSON.stringify(message).length;
      samples.push(performance.now() - start);
    }
    encode[`${blocks} blocks`] = { ...reportable(summarize(samples)), bytes } as never;
  }

  // Expanding and collapsing a folder recomputes the visible list; every
  // native row below the folder re-reads its own selector.
  const toggleSamples: number[] = [];
  const folderId = fixture.folderIds[0]!;
  for (let index = 0; index < TREE_TOGGLES; index += 1) {
    const start = performance.now();
    store.toggleExpanded(folderId);
    toggleSamples.push(performance.now() - start);
  }

  // A keystroke arrives as one `change` from the webview. Nothing outside the
  // editor host may re-render because of it (R-P3).
  const typingNoteId = fixture.noteIds[0]!;
  store.setActiveNote(typingNoteId);
  viewport.reset();
  const typingStart = counter.calls;
  const typingSamples: number[] = [];
  const typingBase = store.getState().documents.get(typingNoteId)!;
  let markdown = typingBase.markdown;
  for (let index = 0; index < KEYSTROKES; index += 1) {
    // The editor owns its own revision line, exactly as the webview does:
    // each change is made against the revision the previous one produced.
    const expectedRevision = typingBase.revision + index;
    markdown = `${markdown}${deterministicWord(index)} `;
    const start = performance.now();
    host.receive({
      v: EDITOR_PROTOCOL_VERSION,
      type: "change",
      changeId: index + 1,
      noteId: typingNoteId,
      document: typingBase.documentJson,
      revision: expectedRevision,
      operations: [
        envelope({
          type: "save_document",
          noteId: typingNoteId,
          documentJson: typingBase.documentJson,
          markdown,
          wordCount: typingBase.wordCount + index + 1,
          expectedRevision,
          at: BASE_TIME + index,
        }),
      ],
    });
    typingSamples.push(performance.now() - start);
  }
  const typingSynchronousCalls = counter.calls - typingStart;
  await new Promise((resolve) => setTimeout(resolve, 50));
  const typingNotifications = viewport.read();
  const typingDrainedCalls = counter.calls - typingStart;

  viewport.dispose();
  host.dispose();
  if (failures.length > 0) {
    throw new AggregateError(failures, "the measured run reported workspace failures");
  }

  const state = store.getState();
  const result = {
    fixture: {
      notes,
      folders: fixture.folderIds.length,
      nodes: fixture.snapshot.nodes.length,
      documents: fixture.snapshot.documents.length,
      ordinaryBlocksPerNote: ORDINARY_BLOCKS,
      snapshotBytes: JSON.stringify(fixture.snapshot).length,
    },
    environment: {
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      date: new Date().toISOString(),
    },
    startup: {
      snapshotReadMs: round(snapshotRead),
      hydrateMs: round(hydrate),
      totalMs: round(snapshotRead + hydrate),
      visibleRowsAfterHydrate: state.visibleIds.length,
      startupBridgeCalls: afterStartupCalls,
      startupBridgeCommands: startupCommands,
    },
    cachedNoteSwitch: {
      ...reportable(summarize(switchSamples)),
      bridgeCalls: navigationBridgeCalls,
      selectorNotifications: navigationNotifications,
      notificationsPerSwitch: round(navigationNotifications / SWITCHES),
    },
    editorLoadEncode: encode,
    treeExpandCollapse: reportable(summarize(toggleSamples)),
    editorChange: {
      ...reportable(summarize(typingSamples)),
      shellSelectorNotifications: typingNotifications,
      synchronousBridgeCalls: typingSynchronousCalls,
      drainedBridgeCalls: typingDrainedCalls,
    },
    rawSwitchSamples: switchSamples.map(round),
  };

  mkdirSync(RAW_DIR, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const file = join(RAW_DIR, `${stamp}-mobile-scale-${notes}.json`);
  writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);

  const { rawSwitchSamples: _raw, ...printable } = result;
  console.log(JSON.stringify(printable, null, 2));
  console.log(`\nwrote ${file}`);
}

const notesArgument = process.argv.indexOf("--notes");
const notes = notesArgument === -1 ? 1000 : Number(process.argv[notesArgument + 1]);
if (!Number.isInteger(notes) || notes <= 0) {
  throw new Error("--notes expects a positive integer");
}

await run(notes);
