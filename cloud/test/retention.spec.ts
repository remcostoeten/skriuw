import {
  env,
  evictDurableObject,
  runDurableObjectAlarm,
  runInDurableObject,
} from "cloudflare:test";
import { describe, expect, it } from "vitest";

import goldenPushV2 from "../../contracts/fixtures/sync-push-v2.json";
import goldenPushV2Content from "../../contracts/fixtures/sync-push-v2-content.json";
import { WorkspaceContentStore, contentDigest } from "../src/content-store";
import {
  MAX_SYNC_PULL_PAGE_BYTES,
  MAX_WORKSPACE_STORAGE_BYTES,
  UNREFERENCED_CHUNK_GRACE_SECONDS,
  type SyncPullResponse,
  type SyncPullResult,
  type SyncPushResult,
  parseSyncPullResponse,
} from "../src/contracts";
import { SYNC_EVENTS_DEVICE_HEADER, SYNC_EVENTS_EXPIRY_HEADER } from "../src/public-api";
import type { WorkspaceSyncObject } from "../src/workspace-sync-object";

const NOW = 1_900_000_000;
const DEVICE_ID = "device-1";
const OTHER_DEVICE_ID = "device-2";

const chunkedContentBytes = new TextEncoder().encode(
  JSON.stringify(goldenPushV2Content),
);
const chunkedDigest = goldenPushV2.operations[1]!.payload.manifest!.chunks[0]!.digest;

type Workspace = DurableObjectStub<WorkspaceSyncObject>;

function pulledPage(result: SyncPullResult): SyncPullResponse {
  if (!result.ok) {
    throw new Error(`log truncated through ${result.compactedThrough}`);
  }
  return parseSyncPullResponse(JSON.parse(result.responseJson));
}

function truncated(result: SyncPullResult): Exclude<SyncPullResult, { ok: true }> {
  if (result.ok) {
    throw new Error("expected a truncated log");
  }
  return result;
}

function accepted(result: SyncPushResult) {
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.response;
}

function folderOperation(
  operationId: string,
  clientSequence: number,
  baseServerSequence: number,
  title = "Folder",
) {
  return {
    operationId,
    clientSequence,
    baseServerSequence,
    payload: {
      form: "inline",
      operation: {
        protocolVersion: 1,
        operation: {
          type: "create_folder",
          id: `folder-${operationId}`,
          title,
          placement: { parentId: null, position: { type: "last" } },
          at: clientSequence,
        },
      },
    },
  };
}

function documentOperation(
  operationId: string,
  clientSequence: number,
  baseServerSequence: number,
  markdownBytes: number,
) {
  return {
    operationId,
    clientSequence,
    baseServerSequence,
    payload: {
      form: "inline",
      operation: {
        protocolVersion: 1,
        operation: {
          type: "save_document",
          noteId: "note-large",
          documentJson: { type: "doc" },
          markdown: "x".repeat(markdownBytes),
          wordCount: 1,
          expectedRevision: clientSequence,
          at: clientSequence,
        },
      },
    },
  };
}

function chunkedOperation(
  operationId: string,
  clientSequence: number,
  baseServerSequence: number,
) {
  return {
    operationId,
    clientSequence,
    baseServerSequence,
    payload: goldenPushV2.operations[1]!.payload,
  };
}

async function buildCheckpoint(
  workspaceId: string,
  serverSequence: number,
  store: WorkspaceContentStore,
  marker = "",
) {
  const archive = {
    archiveVersion: 3,
    protocolVersion: 1,
    exportedAt: 10,
    activeNoteId: null,
    nodes: [],
    documents: [],
    settings: { version: 1, theme: "system", extensions: { marker } },
    tags: [],
    people: [],
    properties: [],
    propertyTemplates: [],
  };
  const bytes = new TextEncoder().encode(JSON.stringify(archive));
  const digest = await contentDigest(bytes);
  await store.putChunk(workspaceId, digest, bytes);
  return {
    digest,
    checkpoint: {
      checkpointVersion: 1,
      syncProtocolVersion: 2,
      archiveVersion: 3,
      workspaceId,
      serverSequence,
      createdAt: NOW,
      content: {
        manifestVersion: 1,
        kind: "checkpoint",
        algorithm: "sha256",
        encoding: "identity",
        contentDigest: digest,
        mimeType: "application/json",
        totalByteLength: bytes.byteLength,
        chunks: [{ digest, byteLength: bytes.byteLength }],
      },
    },
  };
}

/**
 * Pushes the golden v2 batch, acknowledges it, publishes a checkpoint at 2 and
 * compacts, leaving the workspace with an empty log and a floor of 2.
 */
async function compactedWorkspace(workspaceId: string): Promise<{
  workspace: Workspace;
  store: WorkspaceContentStore;
}> {
  const workspace = env.WORKSPACES.getByName(workspaceId);
  const store = new WorkspaceContentStore(env.SYNC_CONTENT);
  await store.putChunk(workspaceId, chunkedDigest, chunkedContentBytes);
  accepted(await workspace.pushOperations({ ...goldenPushV2, deviceId: DEVICE_ID }));
  await workspace.acknowledgeOperations(DEVICE_ID, 2, NOW);
  const { checkpoint } = await buildCheckpoint(workspaceId, 2, store);
  expect(await workspace.publishCheckpoint(checkpoint)).toMatchObject({ ok: true });
  const compacted = await workspace.compact(NOW, 60);
  expect(compacted.removedOperations).toBe(2);
  return { workspace, store };
}

async function readFloor(workspace: Workspace) {
  return runInDurableObject(workspace, (_instance, state) =>
    state.storage.sql
      .exec<{ compacted_through: number; checkpoint_server_sequence: number; compacted_at: number }>(
        "SELECT compacted_through, checkpoint_server_sequence, compacted_at FROM sync_log_floor WHERE id = 1",
      )
      .one(),
  );
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 50));
}

async function openDirectSocket(
  workspace: Workspace,
  deviceId: string,
  expiresAtEpochSeconds: number,
): Promise<WebSocket> {
  const response = await workspace.fetch("https://workspace.internal/events", {
    headers: {
      Upgrade: "websocket",
      [SYNC_EVENTS_DEVICE_HEADER]: deviceId,
      [SYNC_EVENTS_EXPIRY_HEADER]: String(expiresAtEpochSeconds),
    },
  });
  expect(response.status).toBe(101);
  const socket = response.webSocket!;
  socket.accept();
  return socket;
}

describe("compaction floor", () => {
  it("reports a truncated log below the floor and serves from the floor upward", async () => {
    const { workspace } = await compactedWorkspace("floor-basic");

    expect(truncated(await workspace.pullOperations(0, 16))).toEqual({
      ok: false,
      code: "log_truncated",
      compactedThrough: 2,
      checkpointServerSequence: 2,
    });
    expect(truncated(await workspace.pullOperations(1, 16)).compactedThrough).toBe(2);
    expect(pulledPage(await workspace.pullOperations(2, 16))).toMatchObject({
      operations: [],
      latestServerSequence: 2,
    });
    expect(await workspace.workspaceState()).toEqual({
      latestServerSequence: 2,
      compactedThrough: 2,
    });
  });

  it("keeps the floor durable and monotone across further compactions", async () => {
    const { workspace } = await compactedWorkspace("floor-monotone");
    expect(await readFloor(workspace)).toEqual({
      compacted_through: 2,
      checkpoint_server_sequence: 2,
      compacted_at: NOW,
    });

    const again = await workspace.compact(NOW + 1, 60);
    expect(again.removedOperations).toBe(0);
    expect(await readFloor(workspace)).toMatchObject({ compacted_through: 2 });

    accepted(
      await workspace.pushOperations({
        syncProtocolVersion: 2,
        deviceId: DEVICE_ID,
        operations: [folderOperation("operation-3", 3, 2)],
      }),
    );
    await workspace.acknowledgeOperations("device-lagging", 2, NOW);
    const withLagging = await workspace.compact(NOW + 2, 60);
    expect(withLagging.removedOperations).toBe(0);
    expect(await readFloor(workspace)).toMatchObject({ compacted_through: 2 });
    expect(pulledPage(await workspace.pullOperations(2, 16)).operations).toHaveLength(1);
  });

  it("never raises the floor above the oldest retained checkpoint and refuses checkpoints below it", async () => {
    const { workspace, store } = await compactedWorkspace("floor-invariant");
    accepted(
      await workspace.pushOperations({
        syncProtocolVersion: 2,
        deviceId: DEVICE_ID,
        operations: [
          folderOperation("operation-3", 3, 2),
          folderOperation("operation-4", 4, 2),
        ],
      }),
    );
    await workspace.acknowledgeOperations(DEVICE_ID, 4, NOW);

    const below = await buildCheckpoint("floor-invariant", 1, store, "below");
    expect(await workspace.publishCheckpoint(below.checkpoint)).toMatchObject({
      ok: false,
      code: "sync_rejected",
    });

    const later = await buildCheckpoint("floor-invariant", 4, store, "later");
    expect(await workspace.publishCheckpoint(later.checkpoint)).toMatchObject({ ok: true });
    const compacted = await workspace.compact(NOW, 60);
    expect(compacted.removedOperations).toBe(0);
    const floor = await readFloor(workspace);
    const retained = await runInDurableObject(workspace, (_instance, state) =>
      state.storage.sql
        .exec<{ server_sequence: number }>("SELECT server_sequence FROM sync_checkpoints")
        .toArray()
        .map((row) => row.server_sequence),
    );
    expect(floor.compacted_through).toBeLessThanOrEqual(Math.min(...retained));
    expect(floor.compacted_through).toBe(2);
  });

  it("does not raise the floor without a retained checkpoint", async () => {
    const workspaceId = "floor-no-checkpoint";
    const workspace = env.WORKSPACES.getByName(workspaceId);
    const store = new WorkspaceContentStore(env.SYNC_CONTENT);
    await store.putChunk(workspaceId, chunkedDigest, chunkedContentBytes);
    accepted(await workspace.pushOperations({ ...goldenPushV2, deviceId: DEVICE_ID }));
    await workspace.acknowledgeOperations(DEVICE_ID, 2, NOW);

    const compacted = await workspace.compact(NOW, 60);
    expect(compacted.removedOperations).toBe(0);
    expect(await readFloor(workspace)).toEqual({
      compacted_through: 0,
      checkpoint_server_sequence: 0,
      compacted_at: 0,
    });
    expect(pulledPage(await workspace.pullOperations(0, 16)).operations).toHaveLength(2);
  });

  it("still accepts acknowledgements below the floor", async () => {
    const { workspace } = await compactedWorkspace("floor-ack");

    expect(await workspace.acknowledgeOperations(OTHER_DEVICE_ID, 1, NOW)).toEqual({
      ok: true,
      acknowledgedServerSequence: 1,
    });
    expect(await workspace.acknowledgeOperations(DEVICE_ID, 0, NOW)).toEqual({
      ok: true,
      acknowledgedServerSequence: 2,
    });
  });
});

describe("push idempotency across compaction", () => {
  it("answers an identical retry from the operation index after its rows and chunks are gone", async () => {
    const { workspace, store } = await compactedWorkspace("index-retry");
    expect(await store.hasChunk("index-retry", chunkedDigest)).toBe(false);

    const retried = accepted(
      await workspace.pushOperations({ ...goldenPushV2, deviceId: DEVICE_ID }),
    );
    expect(retried).toEqual({
      syncProtocolVersion: 2,
      accepted: [
        { operationId: "operation-1", clientSequence: 1, serverSequence: 1 },
        { operationId: "operation-2", clientSequence: 2, serverSequence: 2 },
      ],
      latestServerSequence: 2,
    });
    expect(pulledPage(await workspace.pullOperations(2, 16)).operations).toEqual([]);
  });

  it("rejects a compacted client sequence re-pushed with different content", async () => {
    const { workspace } = await compactedWorkspace("index-conflict");

    const differentPayload = await workspace.pushOperations({
      syncProtocolVersion: 2,
      deviceId: DEVICE_ID,
      operations: [folderOperation("operation-1", 1, 0, "Renamed")],
    });
    expect(differentPayload).toMatchObject({ ok: false, error: { code: "sync_rejected" } });

    const differentId = await workspace.pushOperations({
      syncProtocolVersion: 2,
      deviceId: DEVICE_ID,
      operations: [folderOperation("operation-other", 1, 0)],
    });
    expect(differentId).toMatchObject({ ok: false, error: { code: "sync_rejected" } });

    const differentBase = await workspace.pushOperations({
      syncProtocolVersion: 2,
      deviceId: DEVICE_ID,
      operations: [{ ...goldenPushV2.operations[0]!, baseServerSequence: 1 }],
    });
    expect(differentBase).toMatchObject({ ok: false, error: { code: "sync_rejected" } });
    expect(await workspace.workspaceState()).toMatchObject({ latestServerSequence: 2 });
  });
});

describe("chunk deletion versus concurrent references", () => {
  it("never lets a committed operation reference a chunk that compaction is deleting", async () => {
    const workspaceId = "chunk-toctou";
    const workspace = env.WORKSPACES.getByName(workspaceId);
    const store = new WorkspaceContentStore(env.SYNC_CONTENT);
    await store.putChunk(workspaceId, chunkedDigest, chunkedContentBytes);
    accepted(await workspace.pushOperations({ ...goldenPushV2, deviceId: DEVICE_ID }));
    await workspace.acknowledgeOperations(DEVICE_ID, 2, NOW);
    const { checkpoint } = await buildCheckpoint(workspaceId, 2, store);
    expect(await workspace.publishCheckpoint(checkpoint)).toMatchObject({ ok: true });

    const gate = { started: false, released: false };
    await runInDurableObject(workspace, (instance) => {
      const content = (instance as unknown as { content: WorkspaceContentStore }).content;
      const original = content.deleteChunks.bind(content);
      content.deleteChunks = async (id, digests) => {
        gate.started = true;
        while (!gate.released) {
          await settle();
        }
        await original(id, digests);
      };
    });

    const compaction = workspace.compact(NOW, 60);
    while (!gate.started) {
      await settle();
    }
    expect(await store.hasChunk(workspaceId, chunkedDigest)).toBe(true);

    const duringDelete = await workspace.pushOperations({
      syncProtocolVersion: 2,
      deviceId: OTHER_DEVICE_ID,
      operations: [chunkedOperation("operation-late-reference", 1, 2)],
    });
    expect(duringDelete).toMatchObject({
      ok: false,
      error: { code: "content_unavailable" },
    });
    const lateCheckpoint = {
      ...checkpoint,
      serverSequence: 2,
      content: {
        manifestVersion: 1,
        kind: "checkpoint",
        algorithm: "sha256",
        encoding: "identity",
        contentDigest: chunkedDigest,
        mimeType: "application/json",
        totalByteLength: chunkedContentBytes.byteLength,
        chunks: [{ digest: chunkedDigest, byteLength: chunkedContentBytes.byteLength }],
      },
    };
    expect(await workspace.publishCheckpoint(lateCheckpoint)).toMatchObject({
      ok: false,
      code: "content_unavailable",
    });

    gate.released = true;
    const compacted = await compaction;
    expect(compacted.removedChunks).toBe(1);
    expect(await store.hasChunk(workspaceId, chunkedDigest)).toBe(false);
    const marks = await runInDurableObject(workspace, (_instance, state) =>
      state.storage.sql.exec("SELECT digest FROM sync_chunk_deleting").toArray(),
    );
    expect(marks).toEqual([]);

    const afterDelete = await workspace.pushOperations({
      syncProtocolVersion: 2,
      deviceId: OTHER_DEVICE_ID,
      operations: [chunkedOperation("operation-late-reference", 1, 2)],
    });
    expect(afterDelete).toMatchObject({ ok: false, error: { code: "content_unavailable" } });

    await store.putChunk(workspaceId, chunkedDigest, chunkedContentBytes);
    const reuploaded = accepted(
      await workspace.pushOperations({
        syncProtocolVersion: 2,
        deviceId: OTHER_DEVICE_ID,
        operations: [chunkedOperation("operation-late-reference", 1, 2)],
      }),
    );
    expect(reuploaded.accepted).toEqual([
      { operationId: "operation-late-reference", clientSequence: 1, serverSequence: 3 },
    ]);
    expect(pulledPage(await workspace.pullOperations(2, 16)).operations).toHaveLength(1);
  });
});

describe("storage accounting and reclamation", () => {
  it("counts each stored digest once and releases it when the chunk is deleted", async () => {
    const workspaceId = "usage-accounting";
    const workspace = env.WORKSPACES.getByName(workspaceId);
    const store = new WorkspaceContentStore(env.SYNC_CONTENT);

    expect(await workspace.storageUsage()).toEqual({
      byteLength: 0,
      quotaBytes: MAX_WORKSPACE_STORAGE_BYTES,
    });
    await store.putChunk(workspaceId, chunkedDigest, chunkedContentBytes);
    await workspace.recordChunkUpload(chunkedDigest, chunkedContentBytes.byteLength);
    const twice = await workspace.recordChunkUpload(chunkedDigest, chunkedContentBytes.byteLength);
    expect(twice.byteLength).toBe(chunkedContentBytes.byteLength);

    accepted(await workspace.pushOperations({ ...goldenPushV2, deviceId: DEVICE_ID }));
    await workspace.acknowledgeOperations(DEVICE_ID, 2, NOW);
    const { checkpoint, digest } = await buildCheckpoint(workspaceId, 2, store);
    const archiveBytes = (checkpoint.content.chunks[0] as { byteLength: number }).byteLength;
    await workspace.recordChunkUpload(digest, archiveBytes);
    expect((await workspace.storageUsage()).byteLength).toBe(
      chunkedContentBytes.byteLength + archiveBytes,
    );
    expect(await workspace.publishCheckpoint(checkpoint)).toMatchObject({ ok: true });

    const compacted = await workspace.compact(NOW, 60);
    expect(compacted.removedChunks).toBe(1);
    expect((await workspace.storageUsage()).byteLength).toBe(archiveBytes);
  });

  it("reclaims unreferenced chunks only after the grace window", async () => {
    const workspaceId = "sweep-unreferenced";
    const workspace = env.WORKSPACES.getByName(workspaceId);
    const store = new WorkspaceContentStore(env.SYNC_CONTENT);
    const abandoned = new TextEncoder().encode("abandoned upload");
    const abandonedDigest = await contentDigest(abandoned);
    await store.putChunk(workspaceId, abandonedDigest, abandoned);
    await workspace.recordChunkUpload(abandonedDigest, abandoned.byteLength);
    await store.putChunk(workspaceId, chunkedDigest, chunkedContentBytes);
    accepted(await workspace.pushOperations({ ...goldenPushV2, deviceId: DEVICE_ID }));

    const uploadedAt = Math.floor(Date.now() / 1_000);
    const fresh = await workspace.compact(uploadedAt + 60, 60 * 60);
    expect(fresh.removedChunks).toBe(0);
    expect(await store.hasChunk(workspaceId, abandonedDigest)).toBe(true);

    const aged = await workspace.compact(
      uploadedAt + UNREFERENCED_CHUNK_GRACE_SECONDS + 60,
      60 * 60,
    );
    expect(aged.removedChunks).toBe(1);
    expect(await store.hasChunk(workspaceId, abandonedDigest)).toBe(false);
    expect(await store.hasChunk(workspaceId, chunkedDigest)).toBe(true);
    expect((await workspace.storageUsage()).byteLength).toBe(0);
  });
});

describe("pull page budget", () => {
  it("cuts a page at the serialized byte budget while always returning one operation", async () => {
    const workspaceId = "page-budget";
    const workspace = env.WORKSPACES.getByName(workspaceId);
    const markdownBytes = 1_200_000;
    accepted(
      await workspace.pushOperations({
        syncProtocolVersion: 2,
        deviceId: DEVICE_ID,
        operations: [
          documentOperation("operation-large-1", 1, 0, markdownBytes),
          documentOperation("operation-large-2", 2, 0, markdownBytes),
          documentOperation("operation-large-3", 3, 0, markdownBytes),
        ],
      }),
    );

    const first = await workspace.pullOperations(0, 128);
    if (!first.ok) {
      throw new Error("unexpected truncation");
    }
    expect(first.responseJson.length).toBeLessThanOrEqual(MAX_SYNC_PULL_PAGE_BYTES);
    const firstPage = pulledPage(first);
    expect(firstPage.operations.map((operation) => operation.serverSequence)).toEqual([1, 2]);
    expect(firstPage.latestServerSequence).toBe(3);

    const second = pulledPage(await workspace.pullOperations(2, 128));
    expect(second.operations.map((operation) => operation.serverSequence)).toEqual([3]);

    const single = pulledPage(await workspace.pullOperations(0, 1));
    expect(single.operations).toHaveLength(1);
  });
});

describe("events channel lifecycle", () => {
  it("closes expired sockets from the alarm and re-arms for the next expiry", async () => {
    const workspace = env.WORKSPACES.getByName("events-alarm");
    const nowEpochSeconds = Math.floor(Date.now() / 1_000);
    const live = await openDirectSocket(workspace, OTHER_DEVICE_ID, nowEpochSeconds + 3_600);
    let liveClosed = false;
    live.addEventListener("close", () => {
      liveClosed = true;
    });
    expect(
      await runInDurableObject(workspace, (_instance, state) => state.storage.getAlarm()),
    ).toBe((nowEpochSeconds + 3_600) * 1_000);

    const expired = await openDirectSocket(workspace, DEVICE_ID, nowEpochSeconds - 1);
    const closes: number[] = [];
    expired.addEventListener("close", (event) => {
      closes.push(event.code);
    });
    await runDurableObjectAlarm(workspace);
    await settle();

    expect(closes).toEqual([1011]);
    expect(liveClosed).toBe(false);
    expect(
      await runInDurableObject(workspace, (_instance, state) => state.storage.getAlarm()),
    ).toBe((nowEpochSeconds + 3_600) * 1_000);
    live.close();
  });

  it("does not broadcast a checkpoint publication", async () => {
    const workspaceId = "events-checkpoint-silent";
    const workspace = env.WORKSPACES.getByName(workspaceId);
    const store = new WorkspaceContentStore(env.SYNC_CONTENT);
    const listener = await openDirectSocket(workspace, OTHER_DEVICE_ID, NOW + 3_600);
    const messages: string[] = [];
    listener.addEventListener("message", (event) => {
      messages.push(String(event.data));
    });

    const { checkpoint } = await buildCheckpoint(workspaceId, 0, store);
    expect(await workspace.publishCheckpoint(checkpoint)).toMatchObject({ ok: true });
    await settle();
    expect(messages).toEqual([]);

    accepted(
      await workspace.pushOperations({
        syncProtocolVersion: 2,
        deviceId: DEVICE_ID,
        operations: [folderOperation("operation-1", 1, 0)],
      }),
    );
    await settle();
    expect(messages).toEqual([
      JSON.stringify({ type: "workspaceChanged", latestServerSequence: 1 }),
    ]);
    listener.close();
  });
});

describe("schema migration", () => {
  it("upgrades an existing version-2 object and backfills the operation index", async () => {
    const workspaceId = "migration-v2-to-v3";
    const workspace = env.WORKSPACES.getByName(workspaceId);
    accepted(
      await workspace.pushOperations({
        syncProtocolVersion: 2,
        deviceId: DEVICE_ID,
        operations: [folderOperation("operation-1", 1, 0), folderOperation("operation-2", 2, 0)],
      }),
    );
    await runInDurableObject(workspace, (_instance, state) => {
      state.storage.sql.exec(`
        DROP TABLE sync_log_floor;
        DROP TABLE sync_operation_index;
        DROP TABLE sync_chunk_deleting;
        DROP TABLE sync_chunk_sizes;
        DROP TABLE sync_storage_usage;
        DELETE FROM _sql_schema_migrations WHERE id = 3;
      `);
    });
    await evictDurableObject(workspace);

    const reopened = env.WORKSPACES.getByName(workspaceId);
    expect(await reopened.workspaceState()).toEqual({ latestServerSequence: 2, compactedThrough: 0 });
    const indexed = await runInDurableObject(reopened, (_instance, state) =>
      state.storage.sql
        .exec<{ operation_id: string; server_sequence: number }>(
          "SELECT operation_id, server_sequence FROM sync_operation_index ORDER BY server_sequence",
        )
        .toArray(),
    );
    expect(indexed).toEqual([
      { operation_id: "operation-1", server_sequence: 1 },
      { operation_id: "operation-2", server_sequence: 2 },
    ]);
    const version = await runInDurableObject(reopened, (_instance, state) =>
      state.storage.sql
        .exec<{ version: number }>("SELECT MAX(id) AS version FROM _sql_schema_migrations")
        .one().version,
    );
    expect(version).toBe(3);

    const retried = accepted(
      await reopened.pushOperations({
        syncProtocolVersion: 2,
        deviceId: DEVICE_ID,
        operations: [folderOperation("operation-2", 2, 0)],
      }),
    );
    expect(retried.accepted).toEqual([
      { operationId: "operation-2", clientSequence: 2, serverSequence: 2 },
    ]);
  });
});
