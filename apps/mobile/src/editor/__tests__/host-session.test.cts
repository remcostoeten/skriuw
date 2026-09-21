import assert from "node:assert/strict";
import test from "node:test";
import { resolveTheme, type ThemeName } from "@skriuw/theme";
import type { BridgePort } from "@skriuw/renderer-core/bridge/port";
import { createMemoryBridge } from "@skriuw/renderer-core/bridge/memory-adapter";
import { envelope, type WorkspaceOperation } from "@skriuw/renderer-core/contracts/workspace";
import { demoSnapshot } from "../../shell/demo-workspace";
import { openWorkspaceSession, type ShellSession } from "../../shell/workspace-session";
import { decodeBase64, encodeBase64 } from "../bytes";
import type { EditorFailureView } from "../failure-view";
import { createEditorHostSession, type EditorHostSession } from "../host-session";
import {
  EDITOR_PROTOCOL_VERSION,
  type EditorToHostMessage,
  type EditorTheme,
  type HostToEditorMessage,
} from "../protocol";

const OPEN_NOTE = "note-native-shell";
const OTHER_NOTE = "note-edge-swipe";

function editorTheme(name: ThemeName): EditorTheme {
  const { source: _source, ...theme } = resolveTheme(name);
  return theme;
}

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

type Harness = {
  workspace: ShellSession;
  host: EditorHostSession;
  sent: HostToEditorMessage[];
  links: string[];
  reported: unknown[];
  failure: () => EditorFailureView | null;
  says: (message: DistributiveOmit<EditorToHostMessage, "v">) => void;
  close: () => Promise<void>;
};

/** Lets every queued commit and bridge round trip settle. */
async function drain(): Promise<void> {
  for (let pass = 0; pass < 12; pass += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

async function openHost(bridge?: BridgePort): Promise<Harness> {
  const port = bridge ?? createMemoryBridge({ snapshot: demoSnapshot() });
  const reported: unknown[] = [];
  const workspace = await openWorkspaceSession(port, (error) => reported.push(error));
  const sent: HostToEditorMessage[] = [];
  const links: string[] = [];
  let failure: EditorFailureView | null = null;
  const host = createEditorHostSession({
    session: workspace,
    send: (message) => sent.push(message),
    openLink: (url) => links.push(url),
    theme: () => editorTheme("midnight"),
    showFailure: (view) => {
      failure = view;
    },
  });

  return {
    workspace,
    host,
    sent,
    links,
    reported,
    failure: () => failure,
    says: (message) => host.receive(JSON.stringify({ ...message, v: EDITOR_PROTOCOL_VERSION })),
    close: async () => {
      host.dispose();
      await workspace.close();
    },
  };
}

function only<T extends HostToEditorMessage["type"]>(
  messages: readonly HostToEditorMessage[],
  type: T,
): Extract<HostToEditorMessage, { type: T }>[] {
  return messages.filter((message) => message.type === type) as Extract<
    HostToEditorMessage,
    { type: T }
  >[];
}

function save(noteId: string, markdown: string, expectedRevision: number): WorkspaceOperation {
  return {
    type: "save_document",
    noteId,
    documentJson: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: markdown }] }],
    },
    markdown,
    wordCount: markdown.split(/\s+/).filter((word) => word.length > 0).length,
    expectedRevision,
    at: 1,
  };
}

test("ready fills the warm webview with the references and the open note", async () => {
  const harness = await openHost();

  harness.says({ type: "ready" });

  const references = only(harness.sent, "references");
  assert.equal(references.length, 1);
  assert.ok(references[0]?.notes.some((note) => note.id === OPEN_NOTE));
  const loads = only(harness.sent, "load");
  assert.equal(loads.length, 1);
  assert.equal(loads[0]?.noteId, OPEN_NOTE);
  assert.equal(loads[0]?.theme.id, "midnight");
  assert.equal(
    loads[0]?.markdown,
    harness.workspace.store.getState().documents.get(OPEN_NOTE)?.markdown,
  );
  assert.equal(harness.failure(), null);

  await harness.close();
});

test("switching notes sends one load and never reloads the page", async () => {
  const harness = await openHost();
  harness.says({ type: "ready" });
  harness.sent.length = 0;

  harness.workspace.store.setActiveNote(OTHER_NOTE);

  assert.equal(harness.sent.length, 1);
  assert.equal(harness.sent[0]?.type, "load");
  assert.equal(only(harness.sent, "load")[0]?.noteId, OTHER_NOTE);

  harness.workspace.store.setActiveNote(OPEN_NOTE);
  assert.equal(harness.sent.length, 2);
  assert.equal(only(harness.sent, "load")[1]?.noteId, OPEN_NOTE);

  await harness.close();
});

test("a change is made durable through the shared save path and acknowledged", async () => {
  const harness = await openHost();
  harness.says({ type: "ready" });
  harness.sent.length = 0;

  harness.says({
    type: "change",
    changeId: 7,
    noteId: OPEN_NOTE,
    document: null,
    revision: 1,
    operations: [envelope(save(OPEN_NOTE, "typed on a phone", 1))],
  });
  await drain();

  const acks = only(harness.sent, "ack");
  assert.equal(acks.length, 1);
  assert.equal(acks[0]?.changeId, 7);
  assert.equal(acks[0]?.ok, true);
  assert.deepEqual(acks[0]?.ok === true ? acks[0].ack.revisions : null, [
    { id: OPEN_NOTE, revision: 2 },
  ]);

  const record = harness.workspace.store.getState().documents.get(OPEN_NOTE);
  assert.equal(record?.markdown, "typed on a phone");
  assert.equal(record?.revision, 2);
  assert.deepEqual(only(harness.sent, "remote-change"), []);
  assert.deepEqual(await harness.workspace.bridge.searchWorkspace("typed on a phone", 5), [
    { noteId: OPEN_NOTE, title: "Native shell", snippet: "typed on a phone", score: 1 },
  ]);

  await harness.close();
});

test("a rejected change carries the backend error back to the editor", async () => {
  const memory = createMemoryBridge({ snapshot: demoSnapshot() });
  const failing: BridgePort = {
    ...memory,
    applyWorkspaceOperations: async () => {
      throw new Error("the workspace database is read-only");
    },
  };
  const harness = await openHost(failing);
  harness.says({ type: "ready" });
  harness.sent.length = 0;

  harness.says({
    type: "change",
    changeId: 1,
    noteId: OPEN_NOTE,
    document: null,
    revision: 1,
    operations: [envelope(save(OPEN_NOTE, "never lands", 1))],
  });
  await drain();

  const acks = only(harness.sent, "ack");
  assert.equal(acks.length, 1);
  assert.equal(acks[0]?.ok, false);
  assert.equal(acks[0]?.ok === false ? acks[0].error : null, "the workspace database is read-only");
  assert.ok(harness.reported.length > 0);
  assert.notEqual(
    harness.workspace.store.getState().documents.get(OPEN_NOTE)?.markdown,
    "never lands",
  );

  await harness.close();
});

test("an operation from a stale editor bundle is refused instead of applied", async () => {
  const harness = await openHost();
  harness.says({ type: "ready" });
  harness.sent.length = 0;

  harness.says({
    type: "change",
    changeId: 2,
    noteId: OPEN_NOTE,
    document: null,
    revision: 1,
    operations: [{ protocolVersion: 0, operation: save(OPEN_NOTE, "from the future", 1) }],
  });
  await drain();

  const acks = only(harness.sent, "ack");
  assert.equal(acks[0]?.ok, false);
  assert.match(acks[0]?.ok === false ? acks[0].error : "", /workspace protocol v0/);
  assert.notEqual(
    harness.workspace.store.getState().documents.get(OPEN_NOTE)?.markdown,
    "from the future",
  );

  await harness.close();
});

test("a remote document reaches the open editor as remote-change", async () => {
  const harness = await openHost();
  harness.says({ type: "ready" });
  harness.sent.length = 0;

  harness.workspace.store.applyRemoteDocuments({
    documents: [
      {
        noteId: OPEN_NOTE,
        documentJson: { type: "doc", content: [] },
        markdown: "written on another device",
        revision: 9,
        wordCount: 4,
      },
    ],
    nodes: [],
  });

  const remote = only(harness.sent, "remote-change");
  assert.equal(remote.length, 1);
  assert.equal(remote[0]?.changeSet.documents[0]?.markdown, "written on another device");
  assert.equal(remote[0]?.changeSet.documents[0]?.revision, 9);

  await harness.close();
});

test("navigate and open-link are handled natively", async () => {
  const harness = await openHost();
  harness.says({ type: "ready" });
  harness.sent.length = 0;

  harness.says({ type: "navigate", noteId: OTHER_NOTE });
  assert.equal(harness.workspace.store.getState().activeNoteId, OTHER_NOTE);
  assert.equal(only(harness.sent, "load")[0]?.noteId, OTHER_NOTE);

  harness.says({ type: "open-link", url: "https://skriuw.dev" });
  assert.deepEqual(harness.links, ["https://skriuw.dev"]);

  await harness.close();
});

test("media requests are served over the bridge and unknown commands refuse", async () => {
  const harness = await openHost();
  harness.says({ type: "ready" });
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
  harness.sent.length = 0;

  harness.says({
    type: "request",
    requestId: 1,
    command: "store_note_image",
    args: { $bytes: encodeBase64(bytes) },
  });
  await drain();
  const stored = only(harness.sent, "response")[0];
  assert.equal(stored?.ok, true);
  const contentHash = (stored?.ok === true ? stored.value : null) as { contentHash: string };

  harness.says({
    type: "request",
    requestId: 2,
    command: "read_note_image_blob",
    args: { contentHash: contentHash.contentHash, mimeType: "image/png" },
  });
  await drain();
  const read = only(harness.sent, "response")[1];
  assert.equal(read?.ok, true);
  const payload = (read?.ok === true ? read.value : null) as { $bytes: string };
  assert.deepEqual([...decodeBase64(payload.$bytes)], [...bytes]);

  harness.says({ type: "request", requestId: 3, command: "export_workspace_archive", args: null });
  await drain();
  const refused = only(harness.sent, "response")[2];
  assert.equal(refused?.ok, false);
  assert.match(
    refused?.ok === false ? refused.error : "",
    /export_workspace_archive is not served by the mobile editor host/,
  );

  await harness.close();
});

test("a failure shows a recoverable surface that a reload clears", async () => {
  const harness = await openHost();
  harness.says({ type: "ready" });

  harness.says({ type: "failure", code: "runtime-error", detail: "TypeError: view is null" });
  assert.equal(harness.failure()?.code, "runtime-error");
  assert.equal(harness.failure()?.detail, "TypeError: view is null");
  assert.ok(harness.reported.length > 0);

  harness.host.restart();
  assert.equal(harness.failure(), null);

  harness.sent.length = 0;
  harness.says({ type: "ready" });
  assert.equal(only(harness.sent, "references").length, 1);
  assert.equal(only(harness.sent, "load")[0]?.noteId, OPEN_NOTE);

  await harness.close();
});

test("a reclaimed webview keeps acknowledged edits and reopens on them", async () => {
  const harness = await openHost();
  harness.says({ type: "ready" });
  harness.says({
    type: "change",
    changeId: 1,
    noteId: OPEN_NOTE,
    document: null,
    revision: 1,
    operations: [envelope(save(OPEN_NOTE, "acknowledged before the crash", 1))],
  });
  await drain();

  harness.host.reportWebviewGone("the Android webview process was reclaimed");
  assert.equal(harness.failure()?.code, "webview-gone");

  harness.sent.length = 0;
  harness.says({ type: "ready" });

  assert.equal(harness.failure(), null);
  const load = only(harness.sent, "load")[0];
  assert.equal(load?.markdown, "acknowledged before the crash");
  assert.equal(load?.revision, 2);

  await harness.close();
});

test("unusable webview messages are refused at the boundary", async () => {
  const harness = await openHost();
  harness.says({ type: "ready" });
  harness.sent.length = 0;

  harness.host.receive("}{ not json");
  assert.equal(harness.failure()?.code, "invalid-message");

  harness.host.receive(JSON.stringify({ v: 99, type: "ready" }));
  assert.match(harness.failure()?.detail ?? "", /editor sent v99/);

  harness.host.receive(JSON.stringify({ v: EDITOR_PROTOCOL_VERSION, type: "navigate" }));
  assert.match(harness.failure()?.detail ?? "", /malformed navigate/);

  assert.deepEqual(harness.sent, []);
  assert.equal(harness.workspace.store.getState().activeNoteId, OPEN_NOTE);

  await harness.close();
});

test("typing moves nothing the shell subscribes to", async () => {
  const harness = await openHost();
  harness.says({ type: "ready" });
  harness.sent.length = 0;
  const store = harness.workspace.store;

  // The two subscriptions the native chrome holds while a note is open.
  let shellRenders = 0;
  const stopTitle = store.subscribe(
    (state) =>
      state.activeNoteId === null ? null : (state.nodes.get(state.activeNoteId)?.title ?? null),
    () => {
      shellRenders += 1;
    },
  );
  const stopRoute = store.subscribe(
    (state) => state.activeNoteId,
    () => {
      shellRenders += 1;
    },
  );

  for (let keystroke = 0; keystroke < 20; keystroke += 1) {
    harness.says({
      type: "change",
      changeId: keystroke + 1,
      noteId: OPEN_NOTE,
      document: null,
      revision: keystroke + 1,
      operations: [envelope(save(OPEN_NOTE, `draft ${keystroke}`, keystroke + 1))],
    });
    await drain();
  }

  stopTitle();
  stopRoute();
  assert.equal(shellRenders, 0);
  assert.equal(only(harness.sent, "ack").length, 20);
  assert.deepEqual(only(harness.sent, "remote-change"), []);
  assert.deepEqual(only(harness.sent, "references"), []);
  assert.deepEqual(only(harness.sent, "load"), []);
  assert.equal(harness.workspace.store.getState().documents.get(OPEN_NOTE)?.markdown, "draft 19");

  await harness.close();
});

test("a theme change reaches the page without a reload", async () => {
  const harness = await openHost();
  harness.says({ type: "ready" });
  harness.sent.length = 0;

  const paper = editorTheme("paper");
  harness.host.setTheme(paper);

  assert.deepEqual(harness.sent, [{ v: EDITOR_PROTOCOL_VERSION, type: "theme", theme: paper }]);

  await harness.close();
});

/** Counts every bridge call, so "no bridge call" is asserted rather than assumed. */
function countingBridge(inner: BridgePort): { bridge: BridgePort; calls: () => number } {
  let calls = 0;
  const bridge = new Proxy(inner, {
    get(target, property, receiver) {
      // oxlint-disable-next-line anti-slop/no-reflect-get -- a Proxy get trap must forward the receiver.
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        calls += 1;
        return (value as (...inner: unknown[]) => unknown).apply(target, args);
      };
    },
  });
  return { bridge, calls: () => calls };
}

test("100 note switches and 60 editor changes reproduce the Mobile 16 invariants", async () => {
  const counted = countingBridge(createMemoryBridge({ snapshot: demoSnapshot() }));
  const harness = await openHost(counted.bridge);
  harness.says({ type: "ready" });
  await drain();
  const store = harness.workspace.store;
  const noteIds = [...store.getState().documents.keys()];
  assert.ok(noteIds.length > 1);

  const beforeSwitches = counted.calls();
  for (let index = 0; index < 100; index += 1) {
    store.setActiveNote(noteIds[(index * 37 + 1) % noteIds.length]!);
  }
  assert.equal(counted.calls() - beforeSwitches, 0);

  store.setActiveNote(OPEN_NOTE);
  harness.sent.length = 0;
  const base = store.getState().documents.get(OPEN_NOTE)!;
  const beforeTyping = counted.calls();
  let markdown = base.markdown;
  for (let index = 0; index < 60; index += 1) {
    markdown = `${markdown} word${index}`;
    const expectedRevision = base.revision + index;
    harness.says({
      type: "change",
      changeId: index + 1,
      noteId: OPEN_NOTE,
      document: null,
      revision: expectedRevision,
      operations: [envelope(save(OPEN_NOTE, markdown, expectedRevision))],
    });
  }
  assert.equal(counted.calls() - beforeTyping, 0);

  for (let pass = 0; pass < 20; pass += 1) await drain();

  const acks = only(harness.sent, "ack");
  assert.equal(acks.length, 60);
  assert.ok(acks.every((ack) => ack.ok));
  assert.deepEqual(only(harness.sent, "remote-change"), []);
  assert.deepEqual(harness.reported, []);
  assert.equal(store.getState().documents.get(OPEN_NOTE)?.revision, base.revision + 60);
  assert.equal(store.getState().documents.get(OPEN_NOTE)?.markdown, markdown);

  await harness.close();
});

test("typed text survives leaving the note and restarting the app", async () => {
  const memory = createMemoryBridge({ snapshot: demoSnapshot() });
  const first = await openHost(memory);
  first.says({ type: "ready" });
  first.says({
    type: "change",
    changeId: 1,
    noteId: OPEN_NOTE,
    document: null,
    revision: 1,
    operations: [envelope(save(OPEN_NOTE, "typed before leaving", 1))],
  });
  await drain();

  first.workspace.store.setActiveNote(OTHER_NOTE);
  first.sent.length = 0;
  first.workspace.store.setActiveNote(OPEN_NOTE);
  const returned = only(first.sent, "load")[0];
  assert.equal(returned?.markdown, "typed before leaving");
  assert.equal(returned?.revision, 2);
  await first.close();

  const restarted = await openHost(memory);
  restarted.workspace.store.setActiveNote(OPEN_NOTE);
  restarted.says({ type: "ready" });
  const reopened = only(restarted.sent, "load")[0];
  assert.equal(reopened?.noteId, OPEN_NOTE);
  assert.equal(reopened?.markdown, "typed before leaving");
  assert.equal(reopened?.revision, 2);
  assert.deepEqual(restarted.reported, []);
  await restarted.close();
});
