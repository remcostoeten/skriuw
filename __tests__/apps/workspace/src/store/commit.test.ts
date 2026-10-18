import assert from "node:assert/strict";
import { test } from "vitest";
import type {
  OperationAck,
  WorkspaceDelta,
  WorkspaceNode,
  WorkspaceOperation,
  WorkspaceOperationEnvelope,
  WorkspaceSnapshot,
} from "@skriuw/renderer-core/contracts/workspace";
import { createCommitGate } from "@skriuw/renderer-core/store/commit-gate";
import { createInitialState, createRendererStore } from "@skriuw/renderer-core/store/store";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { saveWithConflictRetry } from "@/features/editor/persistence/save-retry";
import { createCommitter, isRevisionConflict } from "@/store/commit";

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

type NoteState = {
  id: string;
  title: string;
  markdown: string;
  revision: number;
};

function node(note: NoteState): WorkspaceNode {
  return {
    id: note.id,
    kind: "note",
    parentId: null,
    rank: 100,
    title: note.title,
    icon: null,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    pinnedAt: null,
  };
}

function documentFor(note: NoteState) {
  return {
    noteId: note.id,
    documentJson: { type: "doc" },
    markdown: note.markdown,
    revision: note.revision,
    wordCount: 1,
  };
}

function snapshot(notes: readonly NoteState[]): WorkspaceSnapshot {
  return {
    protocolVersion: 1,
    activeNoteId: notes[0]?.id ?? null,
    nodes: notes.map(node),
    documents: notes.map(documentFor),
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
      editorPlaceholder: "",
    },
    tags: [],
    people: [],
    references: [],
  };
}

function delta(notes: readonly NoteState[]): WorkspaceDelta {
  return { documents: notes.map(documentFor), nodes: notes.map(node) };
}

const original: NoteState = { id: "n1", title: "Original", markdown: "original", revision: 1 };
const remote: NoteState = { id: "n1", title: "Remote", markdown: "remote", revision: 3 };
const other: NoteState = { id: "n2", title: "Other", markdown: "other", revision: 1 };

function storeWith(notes: readonly NoteState[] = [original]): RendererStore {
  return createRendererStore(createInitialState(snapshot(notes)));
}

function save(store: RendererStore, noteId: string, markdown: string): WorkspaceOperation {
  return {
    type: "save_document",
    noteId,
    documentJson: { type: "doc" },
    markdown,
    wordCount: 1,
    expectedRevision: store.getState().documents.get(noteId)?.revision ?? 0,
    at: 10,
  };
}

function rename(noteId: string, title: string): WorkspaceOperation {
  return { type: "rename_node", id: noteId, title, at: 10 };
}

function ack(noteId: string, revision: number): OperationAck {
  return { applied: 1, revisions: [{ id: noteId, revision }], rankChanges: [] };
}

function operationNoteIds(envelopes: readonly WorkspaceOperationEnvelope[]): string {
  return envelopes
    .map(({ operation }) => {
      if (operation.type === "save_document") return operation.noteId;
      if (operation.type === "rename_node") return operation.id;
      return operation.type;
    })
    .join(",");
}

type Reads = {
  bootstrap?: () => Promise<WorkspaceSnapshot>;
  readDelta?: (ids: readonly string[]) => Promise<WorkspaceDelta>;
};

function setup(
  apply: (envelopes: WorkspaceOperationEnvelope[]) => Promise<OperationAck>,
  reads: Reads = {},
) {
  const log: string[] = [];
  const reported: { action: string; error: unknown }[] = [];
  const committer = createCommitter({
    gate: createCommitGate(),
    apply: (envelopes) => {
      log.push(`apply:${operationNoteIds(envelopes)}`);
      return apply(envelopes);
    },
    bootstrap: () => {
      log.push("bootstrap");
      return reads.bootstrap?.() ?? Promise.resolve(snapshot([remote]));
    },
    readDelta: (ids) => {
      log.push(`delta:${ids.join(",")}`);
      return reads.readDelta?.(ids) ?? Promise.resolve(delta([remote]));
    },
    reportRejection: (action, error) => {
      reported.push({ action, error });
    },
  });
  return { committer, log, reported };
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  return assert.fail("expected the commit to reject");
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

test("an acknowledged commit keeps the saved body and never re-reads storage", async () => {
  const store = storeWith();
  const { committer, log } = setup(async () => ack("n1", 2));
  await committer.commitOperations(store, [save(store, "n1", "typed")]);
  const saved = store.getState().documents.get("n1");
  assert.equal(saved?.markdown, "typed");
  assert.equal(saved?.revision, 2);
  assert.deepEqual(log, ["apply:n1"]);
});

test("a rejected commit leaves the canonical record in the store before the error surfaces", async () => {
  const store = storeWith();
  const { committer } = setup(() => Promise.reject(new Error("revision conflict")));
  const error = await rejection(committer.commitOperations(store, [save(store, "n1", "typed")]));
  assert.ok(error instanceof Error);
  assert.match(error.message, /revision conflict/);
  const fresh = store.getState().documents.get("n1");
  assert.equal(fresh?.markdown, "remote");
  assert.equal(fresh?.revision, 3);
});

test("a conflict retry adopts the fresher revision and saves on top of it", async () => {
  const store = storeWith();
  const expectedRevisions: number[] = [];
  const { committer } = setup(async (envelopes) => {
    const operation = envelopes[0]?.operation;
    if (operation?.type !== "save_document") throw new Error("expected a save");
    expectedRevisions.push(operation.expectedRevision);
    if (expectedRevisions.length === 1) throw new Error("revision conflict");
    return ack("n1", 4);
  });
  let lastRevision = store.getState().documents.get("n1")?.revision;
  const adopted: number[] = [];
  await saveWithConflictRetry({
    attempt: async () => {
      lastRevision = store.getState().documents.get("n1")?.revision;
      await committer.commitOperations(store, [save(store, "n1", "mine")]);
    },
    adoptFresh: () => {
      const fresh = store.getState().documents.get("n1");
      if (!fresh || fresh.revision === lastRevision) return false;
      adopted.push(fresh.revision);
      return true;
    },
    isConflict: isRevisionConflict,
    retries: 2,
  });
  assert.deepEqual(expectedRevisions, [1, 3]);
  assert.deepEqual(adopted, [3]);
  const saved = store.getState().documents.get("n1");
  assert.equal(saved?.markdown, "mine");
  assert.equal(saved?.revision, 4);
});

test("a rejection refresh waits for in-flight commits to settle", async () => {
  const store = storeWith([original, other]);
  const pending = deferred<OperationAck>();
  const { committer, log } = setup((envelopes) =>
    operationNoteIds(envelopes) === "n2"
      ? pending.promise
      : Promise.reject(new Error("revision conflict")),
  );
  const first = committer.commitOperations(store, [save(store, "n2", "in flight")]);
  const second = rejection(committer.commitOperations(store, [save(store, "n1", "typed")]));
  await flush();
  assert.deepEqual(log, ["apply:n2", "apply:n1"]);
  log.push("settle:n2");
  pending.resolve(ack("n2", 2));
  await first;
  const error = await second;
  assert.ok(error instanceof Error);
  assert.match(error.message, /revision conflict/);
  assert.deepEqual(log, ["apply:n2", "apply:n1", "settle:n2", "delta:n1"]);
  assert.equal(store.getState().documents.get("n2")?.markdown, "in flight");
  assert.equal(store.getState().documents.get("n1")?.markdown, "remote");
});

test("a failed refresh surfaces the original commit error and reports the refresh failure", async () => {
  const store = storeWith();
  const conflict = new Error("revision conflict");
  const refreshFailure = new Error("bootstrap failed");
  const { committer, reported } = setup(() => Promise.reject(conflict), {
    bootstrap: () => Promise.reject(refreshFailure),
  });
  const error = await rejection(
    committer.commitOperations(store, [save(store, "n1", "typed"), rename("n1", "Typed")]),
  );
  assert.equal(error, conflict);
  assert.equal(isRevisionConflict(error), true);
  assert.deepEqual(reported, [{ action: "rejection refresh", error: refreshFailure }]);
});

test("a save-only conflict re-reads just the saved note", async () => {
  const store = storeWith([original, other]);
  const { committer, log } = setup(() => Promise.reject(new Error("revision conflict")));
  await rejection(committer.commitOperations(store, [save(store, "n1", "typed")]));
  assert.deepEqual(log, ["apply:n1", "delta:n1"]);
  const fresh = store.getState().documents.get("n1");
  assert.equal(fresh?.markdown, "remote");
  assert.equal(fresh?.revision, 3);
  assert.equal(store.getState().documents.get("n2")?.markdown, "other");
});

test("a conflict on a save with a rename re-reads the snapshot and reverts the title", async () => {
  const store = storeWith();
  const { committer, log } = setup(() => Promise.reject(new Error("revision conflict")));
  const pendingCommit = committer.commitOperations(store, [
    save(store, "n1", "typed"),
    rename("n1", "Mine"),
  ]);
  assert.equal(store.getState().nodes.get("n1")?.title, "Mine");
  await rejection(pendingCommit);
  assert.deepEqual(log, ["apply:n1,n1", "bootstrap"]);
  assert.equal(store.getState().nodes.get("n1")?.title, "Remote");
  assert.equal(store.getState().documents.get("n1")?.markdown, "remote");
});

test("a save-only rejection that is not a conflict re-reads the snapshot", async () => {
  const store = storeWith();
  const { committer, log } = setup(() => Promise.reject(new Error("disk full")));
  const error = await rejection(committer.commitOperations(store, [save(store, "n1", "typed")]));
  assert.ok(error instanceof Error);
  assert.equal(error.message, "disk full");
  assert.deepEqual(log, ["apply:n1", "bootstrap"]);
  assert.equal(store.getState().documents.get("n1")?.markdown, "remote");
});

test("a failed delta read surfaces the original conflict and reports the read failure", async () => {
  const store = storeWith();
  const conflict = new Error("revision conflict");
  const readFailure = new Error("delta failed");
  const { committer, log, reported } = setup(() => Promise.reject(conflict), {
    readDelta: () => Promise.reject(readFailure),
  });
  const error = await rejection(committer.commitOperations(store, [save(store, "n1", "typed")]));
  assert.equal(error, conflict);
  assert.deepEqual(log, ["apply:n1", "delta:n1"]);
  assert.deepEqual(reported, [{ action: "rejection refresh", error: readFailure }]);
});

test("a rejected reference update reports the original error after a failed refresh", async () => {
  const store = storeWith();
  const rejected = new Error("disk full");
  const refreshFailure = new Error("bootstrap failed");
  const { committer, log, reported } = setup(() => Promise.reject(rejected), {
    bootstrap: () => Promise.reject(refreshFailure),
  });
  committer.commitReferenceOperations(store, [
    {
      type: "create_tag",
      tag: { id: "t1", name: "tag", color: null, createdAt: 1, updatedAt: 1, createdIn: null },
    },
  ]);
  await flush();
  assert.deepEqual(log, ["apply:create_tag", "bootstrap"]);
  assert.deepEqual(reported, [
    { action: "rejection refresh", error: refreshFailure },
    { action: "reference update", error: rejected },
  ]);
});

test("a rejection refresh never clobbers a save committed while it held the gate", async () => {
  const store = storeWith();
  let disk: NoteState = original;
  const firstRead = deferred<WorkspaceSnapshot>();
  let reads = 0;
  const { committer, log } = setup(
    async (envelopes) => {
      const operation = envelopes[0]?.operation;
      if (operation?.type !== "save_document") throw new Error("expected a save");
      if (operation.markdown === "typed") throw new Error("disk full");
      disk = { ...disk, markdown: operation.markdown, revision: disk.revision + 1 };
      return ack("n1", disk.revision);
    },
    {
      bootstrap: () => {
        reads += 1;
        return reads === 1 ? firstRead.promise : Promise.resolve(snapshot([disk]));
      },
    },
  );
  const rejected = rejection(committer.commitOperations(store, [save(store, "n1", "typed")]));
  await flush();
  assert.deepEqual(log, ["apply:n1", "bootstrap"]);
  const newer = committer.commitOperations(store, [save(store, "n1", "newer")]);
  firstRead.resolve(snapshot([original]));
  await flush();
  assert.equal(store.getState().documents.get("n1")?.markdown, "newer");
  await newer;
  await rejected;
  assert.deepEqual(log, ["apply:n1", "bootstrap", "apply:n1", "bootstrap"]);
  const saved = store.getState().documents.get("n1");
  assert.equal(saved?.markdown, "newer");
  assert.equal(saved?.revision, 2);
});
