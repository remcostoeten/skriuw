import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import goldenPushV2 from "../../contracts/fixtures/sync-push-v2.json";
import goldenPushV2Content from "../../contracts/fixtures/sync-push-v2-content.json";
import {
  type CredentialVerification,
  type CredentialVerifier,
  type WorkspaceMembershipLookup,
  type WorkspaceMembershipSource,
} from "../src/access";
import { WorkspaceContentStore, contentDigest } from "../src/content-store";
import { CANONICAL_CHUNK_BYTES } from "../src/contracts";
import {
  type PublicSyncDependencies,
  type SyncSecurityLogEvent,
  handlePublicSyncRequest,
} from "../src/public-api";

const NOW = 1_900_000_000;
const TOKEN = "valid-token";
const SUBJECT = "user-1";
const DEVICE_ID = "device-1";

const chunkedContentBytes = new TextEncoder().encode(
  JSON.stringify(goldenPushV2Content),
);
const chunkedDigest = goldenPushV2.operations[1]!.payload.manifest!.chunks[0]!.digest;

class StaticVerifier implements CredentialVerifier {
  async verifyBearerToken(token: string): Promise<CredentialVerification> {
    if (token !== TOKEN) {
      return { ok: false, code: "credential_invalid" };
    }
    return {
      ok: true,
      identity: {
        subject: SUBJECT,
        sessionId: "session-1",
        expiresAtEpochSeconds: NOW + 3_600,
      },
    };
  }
}

class StaticMemberships implements WorkspaceMembershipSource {
  private readonly allowed = new Map<string, WorkspaceMembershipLookup>();

  allow(workspaceId: string, role: "owner" | "editor" | "viewer" = "owner"): void {
    this.allowed.set(workspaceId, {
      state: "active",
      membership: { role, deviceIds: [DEVICE_ID] },
    });
  }

  async lookupMembership(
    _subject: string,
    workspaceId: string,
  ): Promise<WorkspaceMembershipLookup> {
    return this.allowed.get(workspaceId) ?? { state: "denied" };
  }
}

type Harness = {
  memberships: StaticMemberships;
  logs: SyncSecurityLogEvent[];
  dependencies: PublicSyncDependencies;
  store: WorkspaceContentStore;
};

function createHarness(): Harness {
  const memberships = new StaticMemberships();
  const logs: SyncSecurityLogEvent[] = [];
  const store = new WorkspaceContentStore(env.SYNC_CONTENT);
  return {
    memberships,
    logs,
    store,
    dependencies: {
      accessConfiguration: {
        state: "ready",
        credentialVerifier: new StaticVerifier(),
        membershipSource: memberships,
      },
      resolveWorkspace: (workspaceId) => env.WORKSPACES.getByName(workspaceId),
      contentStore: store,
      log: (event) => logs.push(event),
      nowEpochSeconds: () => NOW,
    },
  };
}

function chunkRequest(
  workspaceId: string,
  digest: string,
  method: "PUT" | "GET" | "HEAD",
  body?: BodyInit,
  token: string | null = TOKEN,
): Request {
  const headers = new Headers();
  if (token !== null) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return new Request(
    `https://example.test/v1/workspaces/${workspaceId}/chunks/${digest}`,
    { method, headers, body },
  );
}

function jsonRequest(
  workspaceId: string,
  path: string,
  method: "POST" | "GET",
  body?: unknown,
  token: string | null = TOKEN,
): Request {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (token !== null) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return new Request(`https://example.test/v1/workspaces/${workspaceId}/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function buildCheckpoint(
  workspaceId: string,
  serverSequence: number,
  store: WorkspaceContentStore,
  archiveOverrides: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const archive = {
    archiveVersion: 3,
    protocolVersion: 1,
    exportedAt: 10,
    activeNoteId: null,
    nodes: [],
    documents: [],
    settings: { version: 1, theme: "system", extensions: {} },
    tags: [],
    people: [],
    properties: [],
    propertyTemplates: [],
    ...archiveOverrides,
  };
  const bytes = new TextEncoder().encode(JSON.stringify(archive));
  const digest = await contentDigest(bytes);
  await store.putChunk(workspaceId, digest, bytes);
  return {
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
  };
}

describe("authorized chunk transfer", () => {
  it("stores a chunk once and treats an identical retry as a no-op", async () => {
    const harness = createHarness();
    harness.memberships.allow("workspace-upload");

    const first = await handlePublicSyncRequest(
      chunkRequest("workspace-upload", chunkedDigest, "PUT", chunkedContentBytes),
      harness.dependencies,
    );
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ digest: chunkedDigest, created: true });

    const retry = await handlePublicSyncRequest(
      chunkRequest("workspace-upload", chunkedDigest, "PUT", chunkedContentBytes),
      harness.dependencies,
    );
    expect(await retry.json()).toEqual({ digest: chunkedDigest, created: false });

    const probe = await handlePublicSyncRequest(
      chunkRequest("workspace-upload", chunkedDigest, "HEAD"),
      harness.dependencies,
    );
    expect(probe.status).toBe(204);

    const download = await handlePublicSyncRequest(
      chunkRequest("workspace-upload", chunkedDigest, "GET"),
      harness.dependencies,
    );
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(chunkedContentBytes);
  });

  it("rejects bytes that do not hash to the requested digest", async () => {
    const harness = createHarness();
    harness.memberships.allow("workspace-mismatch");

    const response = await handlePublicSyncRequest(
      chunkRequest(
        "workspace-mismatch",
        chunkedDigest,
        "PUT",
        new TextEncoder().encode("different bytes"),
      ),
      harness.dependencies,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "chunk_digest_mismatch" });
    expect(await harness.store.hasChunk("workspace-mismatch", chunkedDigest)).toBe(false);
  });

  it("rejects content above the canonical chunk size", async () => {
    const harness = createHarness();
    harness.memberships.allow("workspace-oversized");
    const oversized = new Uint8Array(CANONICAL_CHUNK_BYTES + 1);

    const response = await handlePublicSyncRequest(
      chunkRequest(
        "workspace-oversized",
        await contentDigest(oversized),
        "PUT",
        oversized,
      ),
      harness.dependencies,
    );

    expect(response.status).toBe(413);
  });

  it("keeps identical bytes in different workspaces mutually unreachable", async () => {
    const harness = createHarness();
    harness.memberships.allow("workspace-owner-a");
    await harness.store.putChunk("workspace-owner-a", chunkedDigest, chunkedContentBytes);

    const foreign = await handlePublicSyncRequest(
      chunkRequest("workspace-owner-b", chunkedDigest, "GET"),
      harness.dependencies,
    );

    expect(foreign.status).toBe(404);
    expect(await foreign.json()).toEqual({ error: "workspace_access_denied" });
  });

  it("requires a credential before any content is readable", async () => {
    const harness = createHarness();
    harness.memberships.allow("workspace-anon");
    await harness.store.putChunk("workspace-anon", chunkedDigest, chunkedContentBytes);

    const response = await handlePublicSyncRequest(
      chunkRequest("workspace-anon", chunkedDigest, "GET", undefined, null),
      harness.dependencies,
    );

    expect(response.status).toBe(401);
  });

  it("refuses an operation whose chunks are only partially uploaded", async () => {
    const harness = createHarness();
    harness.memberships.allow("workspace-partial");

    const response = await handlePublicSyncRequest(
      jsonRequest("workspace-partial", "push", "POST", {
        ...goldenPushV2,
        deviceId: DEVICE_ID,
      }),
      harness.dependencies,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "content_unavailable" });

    const pulled = await handlePublicSyncRequest(
      new Request(
        "https://example.test/v1/workspaces/workspace-partial/pull?" +
          "syncProtocolVersion=2&afterServerSequence=0&limit=128",
        { headers: { Authorization: `Bearer ${TOKEN}` } },
      ),
      harness.dependencies,
    );
    expect(await pulled.json<{ operations: unknown[] }>()).toMatchObject({
      operations: [],
    });
  });
});

describe("checkpoint publication and hydration", () => {
  it("publishes atomically and serves the latest checkpoint", async () => {
    const harness = createHarness();
    harness.memberships.allow("workspace-checkpoint");
    await handlePublicSyncRequest(
      jsonRequest("workspace-checkpoint", "push", "POST", {
        syncProtocolVersion: 1,
        deviceId: DEVICE_ID,
        operations: goldenPushV2.operations
          .slice(0, 1)
          .map((operation) => ({
            operationId: operation.operationId,
            clientSequence: operation.clientSequence,
            baseServerSequence: operation.baseServerSequence,
            operation: operation.payload.operation,
          })),
      }),
      harness.dependencies,
    );

    const checkpoint = await buildCheckpoint("workspace-checkpoint", 1, harness.store);
    const published = await handlePublicSyncRequest(
      jsonRequest("workspace-checkpoint", "checkpoint", "POST", checkpoint),
      harness.dependencies,
    );
    expect(published.status).toBe(200);
    expect(await published.json()).toMatchObject({ serverSequence: 1 });

    const latest = await handlePublicSyncRequest(
      jsonRequest("workspace-checkpoint", "checkpoint", "GET"),
      harness.dependencies,
    );
    expect(await latest.json()).toMatchObject({
      serverSequence: 1,
      archiveVersion: 3,
    });
  });

  it("never publishes a checkpoint whose content is missing", async () => {
    const harness = createHarness();
    harness.memberships.allow("workspace-interrupted");
    const checkpoint = await buildCheckpoint("workspace-interrupted", 0, harness.store);
    await harness.store.deleteChunks("workspace-interrupted", [
      (checkpoint.content as { chunks: { digest: string }[] }).chunks[0]!.digest,
    ]);

    const response = await handlePublicSyncRequest(
      jsonRequest("workspace-interrupted", "checkpoint", "POST", checkpoint),
      harness.dependencies,
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "content_unavailable" });

    const latest = await handlePublicSyncRequest(
      jsonRequest("workspace-interrupted", "checkpoint", "GET"),
      harness.dependencies,
    );
    expect(latest.status).toBe(404);
  });

  it("rejects a checkpoint ahead of the workspace and tolerates duplicate builders", async () => {
    const harness = createHarness();
    harness.memberships.allow("workspace-duplicate");

    const ahead = await buildCheckpoint("workspace-duplicate", 5, harness.store);
    const rejected = await handlePublicSyncRequest(
      jsonRequest("workspace-duplicate", "checkpoint", "POST", ahead),
      harness.dependencies,
    );
    expect(rejected.status).toBe(400);

    const checkpoint = await buildCheckpoint("workspace-duplicate", 0, harness.store);
    const first = await handlePublicSyncRequest(
      jsonRequest("workspace-duplicate", "checkpoint", "POST", checkpoint),
      harness.dependencies,
    );
    const second = await handlePublicSyncRequest(
      jsonRequest("workspace-duplicate", "checkpoint", "POST", checkpoint),
      harness.dependencies,
    );
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ serverSequence: 0 });
  });
});

describe("acknowledgement cursors and compaction", () => {
  it("records a device cursor and refuses one ahead of the log", async () => {
    const harness = createHarness();
    harness.memberships.allow("workspace-ack");

    const ahead = await handlePublicSyncRequest(
      jsonRequest("workspace-ack", "acknowledge", "POST", {
        deviceId: DEVICE_ID,
        serverSequence: 9,
      }),
      harness.dependencies,
    );
    expect(ahead.status).toBe(400);
    expect(await ahead.json()).toEqual({ error: "sync_rejected" });

    const accepted = await handlePublicSyncRequest(
      jsonRequest("workspace-ack", "acknowledge", "POST", {
        deviceId: DEVICE_ID,
        serverSequence: 0,
      }),
      harness.dependencies,
    );
    expect(await accepted.json()).toEqual({
      deviceId: DEVICE_ID,
      acknowledgedServerSequence: 0,
    });
  });

  it("rejects an acknowledgement from a device outside the membership", async () => {
    const harness = createHarness();
    harness.memberships.allow("workspace-ack-foreign");

    const response = await handlePublicSyncRequest(
      jsonRequest("workspace-ack-foreign", "acknowledge", "POST", {
        deviceId: "device-unknown",
        serverSequence: 0,
      }),
      harness.dependencies,
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "device_not_authorized" });
  });

  it("keeps operations a device has not acknowledged and drops what no one needs", async () => {
    const workspaceId = "workspace-compaction";
    const workspace = env.WORKSPACES.getByName(workspaceId);
    const store = new WorkspaceContentStore(env.SYNC_CONTENT);
    await store.putChunk(workspaceId, chunkedDigest, chunkedContentBytes);
    await workspace.pushOperations({
      ...goldenPushV2,
      deviceId: DEVICE_ID,
    });

    const withoutCheckpoint = await workspace.compact(NOW, 60);
    expect(withoutCheckpoint.removedOperations).toBe(0);

    expect(
      await workspace.acknowledgeOperations(DEVICE_ID, 2, NOW),
    ).toMatchObject({ ok: true, acknowledgedServerSequence: 2 });
    const checkpoint = await buildCheckpoint(workspaceId, 2, store);
    expect(await workspace.publishCheckpoint(checkpoint)).toMatchObject({ ok: true });

    const compacted = await workspace.compact(NOW, 60);
    expect(compacted.removedOperations).toBe(2);
    expect(compacted.removedChunks).toBe(1);
    expect(await store.hasChunk(workspaceId, chunkedDigest)).toBe(false);

    const remaining = JSON.parse(await workspace.pullOperations(0, 128)) as {
      operations: unknown[];
    };
    expect(remaining.operations).toEqual([]);
  });

  it("keeps the sequence high-water mark after compaction empties the log", async () => {
    const workspaceId = "workspace-compaction-hwm";
    const workspace = env.WORKSPACES.getByName(workspaceId);
    const store = new WorkspaceContentStore(env.SYNC_CONTENT);
    await store.putChunk(workspaceId, chunkedDigest, chunkedContentBytes);
    await workspace.pushOperations({ ...goldenPushV2, deviceId: DEVICE_ID });
    await workspace.acknowledgeOperations(DEVICE_ID, 2, NOW);
    const checkpoint = await buildCheckpoint(workspaceId, 2, store);
    await workspace.publishCheckpoint(checkpoint);
    const compacted = await workspace.compact(NOW, 60);
    expect(compacted.removedOperations).toBe(2);

    expect(
      await workspace.acknowledgeOperations(DEVICE_ID, 2, NOW),
    ).toMatchObject({ ok: true, acknowledgedServerSequence: 2 });

    const followUp = await workspace.pushOperations({
      syncProtocolVersion: 2,
      deviceId: DEVICE_ID,
      operations: [
        {
          operationId: "operation-after-compaction",
          clientSequence: 3,
          baseServerSequence: 2,
          payload: {
            form: "inline",
            operation: {
              protocolVersion: 1,
              operation: {
                type: "create_folder",
                id: "folder-after-compaction",
                title: "Folder",
                placement: { parentId: null, position: { type: "last" } },
                at: 3,
              },
            },
          },
        },
      ],
    });
    expect(followUp).toMatchObject({
      ok: true,
      response: {
        accepted: [{ operationId: "operation-after-compaction", serverSequence: 3 }],
        latestServerSequence: 3,
      },
    });
  });

  it("holds the log for a lagging device until it is expired as stale", async () => {
    const workspaceId = "workspace-stale-device";
    const workspace = env.WORKSPACES.getByName(workspaceId);
    const store = new WorkspaceContentStore(env.SYNC_CONTENT);
    await store.putChunk(workspaceId, chunkedDigest, chunkedContentBytes);
    await workspace.pushOperations({ ...goldenPushV2, deviceId: DEVICE_ID });

    await workspace.acknowledgeOperations(DEVICE_ID, 2, NOW);
    await workspace.acknowledgeOperations("device-lagging", 0, NOW - 10_000);
    const checkpoint = await buildCheckpoint(workspaceId, 2, store);
    await workspace.publishCheckpoint(checkpoint);

    const held = await workspace.compact(NOW, 60_000);
    expect(held.expiredDevices).toBe(0);
    expect(held.removedOperations).toBe(0);

    const afterExpiry = await workspace.compact(NOW, 60);
    expect(afterExpiry.expiredDevices).toBe(1);
    expect(afterExpiry.removedOperations).toBe(2);
  });
});
