import assert from "node:assert/strict";
import { test } from "vitest";
import { WORKSPACE_PROTOCOL_VERSION, envelope } from "@skriuw/renderer-core/contracts/workspace";
import type {
  OperationAck,
  WorkspaceOperation,
  WorkspaceSnapshot,
} from "@skriuw/renderer-core/contracts/workspace";
import { createEditorSession } from "@/features/editor-standalone/editor-session";
import { DEFAULT_WORKSPACE_SETTINGS } from "@/features/settings/settings-model";
import { createInitialState, createRendererStore } from "@skriuw/renderer-core/store/store";
import { resolveTheme, type ThemeName } from "@skriuw/theme";
import {
  EDITOR_FAILURE_DETAIL_LIMIT,
  EDITOR_PROTOCOL_VERSION,
  parseHostMessage,
  type EditorToHostMessage,
  type EditorTheme,
} from "../../../../../../apps/mobile/src/editor/protocol.ts";

function editorTheme(name: ThemeName): EditorTheme {
  const { source: _source, ...theme } = resolveTheme(name);
  return theme;
}

function documentJson(text: string) {
  return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] };
}

function loadMessage(noteId: string, text: string, revision = 1) {
  return {
    v: EDITOR_PROTOCOL_VERSION,
    type: "load",
    noteId,
    title: noteId,
    document: documentJson(text),
    markdown: `${text}\n`,
    wordCount: 1,
    revision,
    theme: editorTheme("paper"),
  };
}

function saveOperation(noteId: string, text: string, expectedRevision: number): WorkspaceOperation {
  return {
    type: "save_document",
    noteId,
    documentJson: documentJson(text),
    markdown: `${text}\n`,
    wordCount: 1,
    expectedRevision,
    at: 1,
  };
}

function harness(replyTimeoutMs = 1_000) {
  const store = createRendererStore(
    createInitialState({
      protocolVersion: WORKSPACE_PROTOCOL_VERSION,
      activeNoteId: null,
      nodes: [],
      documents: [],
      historyHeaders: [],
      settings: DEFAULT_WORKSPACE_SETTINGS,
      tags: [],
      people: [],
      references: [],
    }),
  );
  const sent: EditorToHostMessage[] = [];
  const session = createEditorSession({
    store,
    send: (message) => sent.push(message),
    replyTimeoutMs,
  });
  return { store, sent, session };
}

function submit(session: ReturnType<typeof harness>["session"], operation: WorkspaceOperation) {
  return session.invoke<OperationAck>("apply_workspace_operations", {
    operations: [envelope(operation)],
  });
}

test("load adopts the document, the theme and the active note without a change", () => {
  const { store, sent, session } = harness();
  session.receive(loadMessage("a", "alpha"));
  const state = store.getState();
  assert.equal(state.activeNoteId, "a");
  assert.deepEqual(state.documents.get("a")?.documentJson, documentJson("alpha"));
  assert.equal(state.settings.theme, "paper");
  assert.deepEqual(sent, []);
});

test("a stale load never rewinds a document the editor already advanced", () => {
  const { store, session } = harness();
  session.receive(loadMessage("a", "newer", 4));
  session.receive(loadMessage("a", "older", 2));
  assert.equal(store.getState().documents.get("a")?.revision, 4);
  assert.deepEqual(store.getState().documents.get("a")?.documentJson, documentJson("newer"));
});

test("changes leave in submission order and settle by their own acknowledgement", async () => {
  const { sent, session } = harness();
  session.receive(loadMessage("a", "alpha"));
  session.receive(loadMessage("b", "beta"));
  const first = submit(session, saveOperation("a", "alpha one", 1));
  const second = submit(session, saveOperation("b", "beta one", 1));
  const changes = sent.filter((message) => message.type === "change");
  assert.deepEqual(
    changes.map(({ changeId, noteId, revision }) => ({ changeId, noteId, revision })),
    [
      { changeId: 1, noteId: "a", revision: 1 },
      { changeId: 2, noteId: "b", revision: 1 },
    ],
  );
  assert.deepEqual(changes[0]?.operations, [envelope(saveOperation("a", "alpha one", 1))]);
  session.receive({
    v: EDITOR_PROTOCOL_VERSION,
    type: "ack",
    changeId: 2,
    ok: true,
    ack: { applied: 1, revisions: [{ id: "b", revision: 2 }], rankChanges: [] },
  });
  session.receive({
    v: EDITOR_PROTOCOL_VERSION,
    type: "ack",
    changeId: 1,
    ok: false,
    error: "revision conflict",
  });
  assert.deepEqual((await second).revisions, [{ id: "b", revision: 2 }]);
  await assert.rejects(first, /revision conflict/);
});

test("the rollback snapshot holds acknowledged documents, not optimistic ones", async () => {
  const { session } = harness();
  session.receive(loadMessage("a", "alpha"));
  const accepted = submit(session, saveOperation("a", "alpha durable", 1));
  session.receive({
    v: EDITOR_PROTOCOL_VERSION,
    type: "ack",
    changeId: 1,
    ok: true,
    ack: { applied: 1, revisions: [{ id: "a", revision: 2 }], rankChanges: [] },
  });
  await accepted;
  const rejected = submit(session, saveOperation("a", "alpha rejected", 2));
  session.receive({
    v: EDITOR_PROTOCOL_VERSION,
    type: "ack",
    changeId: 2,
    ok: false,
    error: "disk full",
  });
  await assert.rejects(rejected, /disk full/);
  const snapshot = await session.invoke<WorkspaceSnapshot>("bootstrap_workspace");
  assert.deepEqual(
    snapshot.documents.map(({ noteId, revision, documentJson: json }) => ({
      noteId,
      revision,
      json,
    })),
    [{ noteId: "a", revision: 2, json: documentJson("alpha durable") }],
  );
});

test("an unacknowledged change rejects and reports a bounded failure", async () => {
  const { sent, session } = harness(5);
  session.receive(loadMessage("a", "alpha"));
  await assert.rejects(submit(session, saveOperation("a", "alpha one", 1)), /did not acknowledge/);
  const failure = sent.find((message) => message.type === "failure");
  assert.equal(failure?.code, "change-unacknowledged");
});

test("opening another note asks the host and keeps the loaded note on screen", () => {
  const { store, sent, session } = harness();
  session.receive(loadMessage("a", "alpha"));
  session.receive({
    v: EDITOR_PROTOCOL_VERSION,
    type: "references",
    notes: [{ id: "b", title: "Beta" }],
    tags: [{ id: "t", name: "tag", color: null }],
    people: [{ id: "p", name: "Ada", initials: "A", color: null }],
  });
  assert.equal(store.getState().nodes.get("b")?.title, "Beta");
  assert.equal(store.getState().tags.get("t")?.name, "tag");
  assert.equal(store.getState().people.get("p")?.name, "Ada");
  store.setActiveNote("b");
  assert.deepEqual(sent, [{ v: EDITOR_PROTOCOL_VERSION, type: "navigate", noteId: "b" }]);
  assert.equal(store.getState().activeNoteId, "a");
});

test("media commands cross as requests with bytes as base64 both ways", async () => {
  const { sent, session } = harness();
  const stored = session.invoke<{ contentHash: string }>(
    "store_note_image",
    new Uint8Array([1, 2, 3]),
  );
  const read = session.invoke<ArrayBuffer>("read_note_image_blob", {
    contentHash: "h",
    mimeType: "image/png",
  });
  assert.deepEqual(
    sent.map((message) =>
      message.type === "request" ? [message.requestId, message.command, message.args] : null,
    ),
    [
      [1, "store_note_image", { $bytes: "AQID" }],
      [2, "read_note_image_blob", { contentHash: "h", mimeType: "image/png" }],
    ],
  );
  session.receive({
    v: EDITOR_PROTOCOL_VERSION,
    type: "response",
    requestId: 1,
    ok: true,
    value: { contentHash: "h" },
  });
  session.receive({
    v: EDITOR_PROTOCOL_VERSION,
    type: "response",
    requestId: 2,
    ok: true,
    value: { $bytes: "AQID" },
  });
  assert.deepEqual(await stored, { contentHash: "h" });
  assert.deepEqual([...new Uint8Array(await read)], [1, 2, 3]);
});

test("remote changes and theme messages update the store in place", () => {
  const { store, session } = harness();
  session.receive(loadMessage("a", "alpha"));
  session.receive({
    v: EDITOR_PROTOCOL_VERSION,
    type: "remote-change",
    changeSet: {
      documents: [
        {
          noteId: "a",
          document: documentJson("remote"),
          markdown: "remote\n",
          wordCount: 1,
          revision: 5,
        },
      ],
    },
  });
  session.receive({
    v: EDITOR_PROTOCOL_VERSION,
    type: "theme",
    theme: editorTheme("embers"),
  });
  assert.equal(store.getState().documents.get("a")?.revision, 5);
  assert.equal(store.getState().settings.theme, "embers");
  assert.equal(store.getState().activeNoteId, "a");
});

test("messages from another protocol version or shape are refused with a failure", () => {
  const { store, sent, session } = harness();
  session.receive({ ...loadMessage("a", "alpha"), v: EDITOR_PROTOCOL_VERSION + 1 });
  session.receive(JSON.stringify({ v: EDITOR_PROTOCOL_VERSION, type: "load", noteId: 7 }));
  session.receive("not json");
  assert.deepEqual(
    sent.map((message) => (message.type === "failure" ? message.code : message.type)),
    ["protocol-version", "invalid-message", "invalid-message"],
  );
  assert.equal(store.getState().activeNoteId, null);
  assert.equal(parseHostMessage(JSON.stringify(loadMessage("a", "alpha"))).ok, true);
});

test("failure details stay bounded", () => {
  const { sent, session } = harness();
  session.fail("runtime-error", "x".repeat(EDITOR_FAILURE_DETAIL_LIMIT * 4));
  const failure = sent[0];
  assert.equal(failure?.type === "failure" && failure.detail.length, EDITOR_FAILURE_DETAIL_LIMIT);
});
