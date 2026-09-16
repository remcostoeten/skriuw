import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { WorkspaceContentStore, contentDigest } from "../src/content-store";
import {
  WORKSPACE_SYNC_PROTOCOL_VERSION,
  parseSyncPullResponse,
  type SyncPullResult,
  type SyncPushResult,
} from "../src/contracts";
import type { WorkspaceSyncObject } from "../src/workspace-sync-object";

type Workspace = DurableObjectStub<WorkspaceSyncObject>;

/**
 * The literal that must never appear anywhere the service can read it. The
 * suite pushes it inside sealed payloads and then greps every stored row,
 * every returned page, and every stored chunk for it.
 */
const NOTE_BODY = "gerbrandy-street-lease-2029";
const KEY_ID = "0f1e2d3c4b5a6978";
const NONCE = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const SCHEME = "argon2id-xchacha20poly1305-v2";

function sealedCiphertext(marker: string): string {
  const bytes = new TextEncoder().encode(marker);
  const rotated = bytes.map((byte) => (byte + 137) % 256);
  return btoa(String.fromCharCode(...rotated));
}

function sealedOperation(
  operationId: string,
  clientSequence: number,
  baseServerSequence: number,
  marker = NOTE_BODY,
) {
  return {
    operationId,
    clientSequence,
    baseServerSequence,
    payload: {
      form: "sealed" as const,
      operation: {
        scheme: SCHEME,
        keyId: KEY_ID,
        nonce: NONCE,
        transport: "inline" as const,
        ciphertext: sealedCiphertext(marker),
      },
    },
  };
}

const PLAINTEXT_TITLE = "plaintext-folder-title-4711";

function plaintextRequest(deviceId: string, operationId: string, clientSequence: number) {
  return {
    syncProtocolVersion: WORKSPACE_SYNC_PROTOCOL_VERSION,
    deviceId,
    operations: [
      {
        operationId,
        clientSequence,
        baseServerSequence: 0,
        payload: {
          form: "inline" as const,
          operation: {
            protocolVersion: 1,
            operation: {
              type: "create_folder",
              id: `folder-${operationId}`,
              title: PLAINTEXT_TITLE,
              placement: { parentId: null, position: { type: "last" } },
              at: 1,
            },
          },
        },
      },
    ],
  };
}

function sealedRequest(deviceId: string, operations: ReturnType<typeof sealedOperation>[]) {
  return {
    syncProtocolVersion: WORKSPACE_SYNC_PROTOCOL_VERSION,
    deviceId,
    operations,
  };
}

function accepted(result: SyncPushResult) {
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.response;
}

function pulledPage(result: SyncPullResult) {
  if (!result.ok) {
    throw new Error(`log truncated through ${result.compactedThrough}`);
  }
  return { parsed: parseSyncPullResponse(JSON.parse(result.responseJson)), raw: result.responseJson };
}

async function storedRows(workspace: Workspace): Promise<string> {
  return runInDurableObject(workspace, (_instance, state) =>
    JSON.stringify([
      ...state.storage.sql
        .exec("SELECT operation_id, device_id, payload_json FROM sync_operations")
        .toArray(),
      ...state.storage.sql.exec("SELECT * FROM sync_checkpoints").toArray(),
    ]),
  );
}

describe("sealed sync payloads", () => {
  it("stores and returns sealed operations without ever holding their plaintext", async () => {
    const workspace = env.WORKSPACES.getByName("sealed-workspace-1") as Workspace;
    const response = accepted(
      await workspace.pushOperations(
        sealedRequest("device-sealed", [
          sealedOperation("sealed-operation-1", 1, 0),
          sealedOperation("sealed-operation-2", 2, 0, "tags: divorce, oncology"),
        ]),
      ),
    );
    expect(response.accepted).toHaveLength(2);

    const rows = await storedRows(workspace);
    expect(rows).not.toContain(NOTE_BODY);
    expect(rows).not.toContain("oncology");
    expect(rows).toContain(KEY_ID);

    const { parsed, raw } = pulledPage(await workspace.pullOperations(0, 32));
    expect(raw).not.toContain(NOTE_BODY);
    expect(parsed.operations).toHaveLength(2);
    const [first] = parsed.operations;
    if (first?.payload.form !== "sealed") {
      throw new Error("expected the sealed payload back unchanged");
    }
    expect(first.payload.operation).toEqual({
      scheme: SCHEME,
      keyId: KEY_ID,
      nonce: NONCE,
      transport: "inline",
      ciphertext: sealedCiphertext(NOTE_BODY),
    });
  });

  it("keeps sealed chunked content opaque and reference-counted", async () => {
    const workspace = env.WORKSPACES.getByName("sealed-workspace-2") as Workspace;
    const store = new WorkspaceContentStore(env.SYNC_CONTENT);
    const ciphertext = new TextEncoder().encode(sealedCiphertext(NOTE_BODY).repeat(8));
    const digest = await contentDigest(ciphertext);
    const stored = await store.putChunk("sealed-workspace-2", digest, ciphertext);
    if (!stored.ok) {
      throw new Error(`sealed chunk rejected: ${stored.code}`);
    }

    accepted(
      await workspace.pushOperations(
        sealedRequest("device-sealed", [
          {
            operationId: "sealed-chunked-1",
            clientSequence: 1,
            baseServerSequence: 0,
            payload: {
              form: "sealed" as const,
              operation: {
                scheme: SCHEME,
                keyId: KEY_ID,
                nonce: NONCE,
                transport: "chunked" as const,
                manifest: {
                  manifestVersion: 1,
                  kind: "operation_envelope",
                  algorithm: "sha256",
                  encoding: "identity",
                  contentDigest: digest,
                  mimeType: "application/octet-stream",
                  totalByteLength: ciphertext.byteLength,
                  chunks: [{ digest, byteLength: ciphertext.byteLength }],
                },
              },
            },
          } as unknown as ReturnType<typeof sealedOperation>,
        ]),
      ),
    );

    const references = await runInDurableObject(workspace, (_instance, state) =>
      state.storage.sql
        .exec<{ digest: string; ref_kind: string }>(
          "SELECT digest, ref_kind FROM sync_chunk_refs",
        )
        .toArray(),
    );
    expect(references).toEqual([{ digest, ref_kind: "operation" }]);

    const rows = await storedRows(workspace);
    expect(rows).not.toContain(NOTE_BODY);
  });

  it("rejects a sealed payload whose transport metadata is malformed", async () => {
    const workspace = env.WORKSPACES.getByName("sealed-workspace-3") as Workspace;
    const malformed = sealedRequest("device-sealed", [sealedOperation("sealed-bad-1", 1, 0)]);
    malformed.operations[0]!.payload.operation.nonce = "too-short";
    const result = await workspace.pushOperations(malformed);
    expect(result.ok).toBe(false);

    const missingCiphertext = sealedRequest("device-sealed", [sealedOperation("sealed-bad-2", 1, 0)]);
    missingCiphertext.operations[0]!.payload.operation.ciphertext = "";
    expect((await workspace.pushOperations(missingCiphertext)).ok).toBe(false);

    const unknownScheme = sealedRequest("device-sealed", [sealedOperation("sealed-bad-3", 1, 0)]);
    unknownScheme.operations[0]!.payload.operation.scheme = "not a scheme";
    expect((await workspace.pushOperations(unknownScheme)).ok).toBe(false);
  });

  it("accepts a sealed checkpoint and stores only its opaque manifest", async () => {
    const workspace = env.WORKSPACES.getByName("sealed-workspace-4") as Workspace;
    accepted(
      await workspace.pushOperations(
        sealedRequest("device-sealed", [sealedOperation("sealed-checkpoint-op-1", 1, 0)]),
      ),
    );
    const store = new WorkspaceContentStore(env.SYNC_CONTENT);
    const ciphertext = new TextEncoder().encode(sealedCiphertext(NOTE_BODY).repeat(4));
    const digest = await contentDigest(ciphertext);
    const stored = await store.putChunk("sealed-workspace-4", digest, ciphertext);
    if (!stored.ok) {
      throw new Error(`sealed checkpoint chunk rejected: ${stored.code}`);
    }

    const published = await workspace.publishCheckpoint({
      checkpointVersion: 1,
      syncProtocolVersion: WORKSPACE_SYNC_PROTOCOL_VERSION,
      archiveVersion: 3,
      workspaceId: "sealed-workspace-4",
      serverSequence: 1,
      createdAt: 10,
      content: {
        manifestVersion: 1,
        kind: "checkpoint",
        algorithm: "sha256",
        encoding: "identity",
        contentDigest: digest,
        mimeType: "application/octet-stream",
        totalByteLength: ciphertext.byteLength,
        chunks: [{ digest, byteLength: ciphertext.byteLength }],
      },
      seal: { scheme: SCHEME, keyId: KEY_ID, nonce: NONCE },
    });
    expect(published.ok).toBe(true);

    const latest = await workspace.latestCheckpoint();
    expect(latest).not.toBeNull();
    expect(latest).toContain(KEY_ID);
    expect(latest).not.toContain(NOTE_BODY);
  });

  it("refuses plaintext pushes once the workspace holds sealed content", async () => {
    const workspace = env.WORKSPACES.getByName("sealed-workspace-5") as Workspace;
    accepted(
      await workspace.pushOperations(
        sealedRequest("device-sealed", [sealedOperation("sealed-first-1", 1, 0)]),
      ),
    );

    const refused = await workspace.pushOperations(
      plaintextRequest("device-legacy", "plaintext-after-seal-1", 1),
    );
    expect(refused.ok).toBe(false);
    if (refused.ok) {
      throw new Error("a plaintext push reached an encrypted workspace");
    }
    expect(refused.error.code).toBe("workspace_encrypted");

    const rows = await storedRows(workspace);
    expect(rows).not.toContain(PLAINTEXT_TITLE);
    const { parsed } = pulledPage(await workspace.pullOperations(0, 32));
    expect(parsed.operations.map((operation) => operation.operationId)).toEqual([
      "sealed-first-1",
    ]);
  });

  it("refuses a plaintext checkpoint once the workspace holds sealed content", async () => {
    const workspace = env.WORKSPACES.getByName("sealed-workspace-6") as Workspace;
    accepted(
      await workspace.pushOperations(
        sealedRequest("device-sealed", [sealedOperation("sealed-first-2", 1, 0)]),
      ),
    );
    const store = new WorkspaceContentStore(env.SYNC_CONTENT);
    const archive = new TextEncoder().encode(JSON.stringify({ title: PLAINTEXT_TITLE }));
    const digest = await contentDigest(archive);
    const stored = await store.putChunk("sealed-workspace-6", digest, archive);
    if (!stored.ok) {
      throw new Error(`checkpoint chunk rejected: ${stored.code}`);
    }

    const published = await workspace.publishCheckpoint({
      checkpointVersion: 1,
      syncProtocolVersion: WORKSPACE_SYNC_PROTOCOL_VERSION,
      archiveVersion: 3,
      workspaceId: "sealed-workspace-6",
      serverSequence: 1,
      createdAt: 10,
      content: {
        manifestVersion: 1,
        kind: "checkpoint",
        algorithm: "sha256",
        encoding: "identity",
        contentDigest: digest,
        mimeType: "application/json",
        totalByteLength: archive.byteLength,
        chunks: [{ digest, byteLength: archive.byteLength }],
      },
    });
    expect(published).toMatchObject({ ok: false, code: "workspace_encrypted" });
    expect(await workspace.latestCheckpoint()).toBeNull();
  });

  it("keeps answering identical retries of operations accepted before encryption", async () => {
    const workspace = env.WORKSPACES.getByName("sealed-workspace-7") as Workspace;
    const before = plaintextRequest("device-legacy", "plaintext-before-seal-1", 1);
    const first = accepted(await workspace.pushOperations(before));
    accepted(
      await workspace.pushOperations(
        sealedRequest("device-sealed", [sealedOperation("sealed-after-plain-1", 1, 1)]),
      ),
    );

    const retried = accepted(await workspace.pushOperations(before));
    expect(retried.accepted).toEqual(first.accepted);
  });

  it("lets exactly one device claim a workspace's encryption key", async () => {
    const workspace = env.WORKSPACES.getByName("sealed-workspace-8") as Workspace;
    const first = await workspace.claimWorkspaceEncryption({ scheme: SCHEME, keyId: KEY_ID });
    const second = await workspace.claimWorkspaceEncryption({
      scheme: SCHEME,
      keyId: "9999999999999999",
    });
    expect(first).toMatchObject({ ok: true, marker: { keyId: KEY_ID } });
    expect(second).toMatchObject({ ok: true, marker: { keyId: KEY_ID } });
    expect(await workspace.workspaceEncryption()).toMatchObject({ keyId: KEY_ID });

    const foreign = sealedRequest("device-other", [sealedOperation("foreign-key-1", 1, 0)]);
    foreign.operations[0]!.payload.operation.keyId = "9999999999999999";
    const refused = await workspace.pushOperations(foreign);
    expect(refused).toMatchObject({ ok: false, error: { code: "encryption_key_mismatch" } });
  });
});
