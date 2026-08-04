import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import goldenPush from "../../contracts/fixtures/sync-push-v1.json";
import workspaceOperationSchema from "../../contracts/generated/workspace-operation.schema.json";
import {
  WORKSPACE_OPERATION_SYNC_POLICY_V1,
  parseSyncPullResponse,
  parseSyncPushRequest,
  type SyncPushResult,
  type SyncPushResponse,
} from "../src/contracts";

function requirePushSuccess(result: SyncPushResult): SyncPushResponse {
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.response;
}

describe("WorkspaceSyncObject", () => {
  it("keeps the generated policy exhaustive over the Rust operation schema", () => {
    const schemaOperationTypes = workspaceOperationSchema.$defs.WorkspaceOperation.oneOf
      .map((variant) => variant.properties.type.const)
      .sort();
    const policyOperationTypes = WORKSPACE_OPERATION_SYNC_POLICY_V1
      .map((policy) => policy.operationType)
      .sort();

    expect(policyOperationTypes).toEqual(schemaOperationTypes);
    expect(new Set(policyOperationTypes).size).toBe(policyOperationTypes.length);
  });

  it("assigns an ordered server sequence and supports cursor pull", async () => {
    const workspace = env.WORKSPACES.getByName("workspace-1");
    const request = parseSyncPushRequest(goldenPush);

    const pushed = requirePushSuccess(await workspace.pushOperations(request));
    expect(pushed.accepted).toEqual([
      { operationId: "operation-1", clientSequence: 1, serverSequence: 1 },
    ]);
    expect(pushed.latestServerSequence).toBe(1);

    const pulled = parseSyncPullResponse(
      JSON.parse(await workspace.pullOperations(0, 16)),
    );
    expect(pulled.latestServerSequence).toBe(1);
    expect(pulled.operations).toHaveLength(1);
    expect(pulled.operations[0]?.operationId).toBe("operation-1");
    expect(pulled.operations[0]?.operation.operation.type).toBe("create_folder");

    const exhausted = parseSyncPullResponse(
      JSON.parse(await workspace.pullOperations(1, 16)),
    );
    expect(exhausted.operations).toEqual([]);
  });

  it("accepts an identical retry without appending a duplicate", async () => {
    const workspace = env.WORKSPACES.getByName("workspace-retry");
    const request = parseSyncPushRequest(goldenPush);

    const first = requirePushSuccess(await workspace.pushOperations(request));
    const retry = requirePushSuccess(await workspace.pushOperations(request));
    expect(retry).toEqual(first);
    const pulled = parseSyncPullResponse(
      JSON.parse(await workspace.pullOperations(0)),
    );
    expect(pulled.operations).toHaveLength(1);
  });

  it("accepts representative replicated workspace content", async () => {
    const workspace = env.WORKSPACES.getByName("workspace-content-policy");
    const batch = parseSyncPushRequest(goldenPush);
    const rename = structuredClone(batch.operations[0]!);
    rename.operationId = "operation-2";
    rename.clientSequence = 2;
    rename.operation.operation = {
      type: "rename_node",
      id: "folder-1",
      title: "Renamed",
      at: 2,
    };
    batch.operations.push(rename);

    const result = requirePushSuccess(await workspace.pushOperations(batch));
    expect(result.accepted).toHaveLength(2);
    expect(result.latestServerSequence).toBe(2);
  });

  it("rejects device-local operations with a stable error code", async () => {
    const workspace = env.WORKSPACES.getByName("workspace-device-local");
    const request = parseSyncPushRequest(goldenPush);
    request.operations[0]!.operation.operation = {
      type: "set_active_note",
      noteId: "note-1",
    };

    expect(await workspace.pushOperations(request)).toEqual({
      ok: false,
      error: {
        code: "device_local_operation",
        message:
          "workspace operation set_active_note is device-local and cannot be replicated",
      },
    });
  });

  it("rejects protocol-v1 unsupported operations with a stable error code", async () => {
    const workspace = env.WORKSPACES.getByName("workspace-unsupported");
    const request = parseSyncPushRequest(goldenPush);
    request.operations[0]!.operation.operation = { type: "attach_image" };

    expect(await workspace.pushOperations(request)).toEqual({
      ok: false,
      error: {
        code: "unsupported_operation",
        message:
          "workspace operation attach_image requires a later sync protocol capability",
      },
    });
  });

  it("rejects malformed envelopes and unknown operation types", async () => {
    const workspace = env.WORKSPACES.getByName("workspace-malformed");
    const malformed = structuredClone(goldenPush);
    Object.assign(malformed.operations[0]!, { operation: null });
    const malformedResult = await workspace.pushOperations(malformed);
    expect(malformedResult).toMatchObject({
      ok: false,
      error: { code: "sync_rejected" },
    });

    const unknown = parseSyncPushRequest(goldenPush);
    unknown.operations[0]!.operation.operation = { type: "future_operation" };
    expect(await workspace.pushOperations(unknown)).toEqual({
      ok: false,
      error: {
        code: "sync_rejected",
        message: "unknown workspace operation type future_operation",
      },
    });
  });

  it("rejects operation id reuse with different content", async () => {
    const workspace = env.WORKSPACES.getByName("workspace-conflict");
    const request = parseSyncPushRequest(goldenPush);
    requirePushSuccess(await workspace.pushOperations(request));

    const changed = structuredClone(goldenPush);
    changed.operations[0]!.operation.operation.title = "Changed";
    const result = await workspace.pushOperations(parseSyncPushRequest(changed));
    expect(result).toEqual({
      ok: false,
      error: {
        code: "sync_rejected",
        message: "operation id operation-1 was reused with different content",
      },
    });
  });

  it("rejects a device sequence gap atomically", async () => {
    const workspace = env.WORKSPACES.getByName("workspace-gap");
    const changed = structuredClone(goldenPush);
    changed.operations[0]!.clientSequence = 2;

    const result = await workspace.pushOperations(parseSyncPushRequest(changed));
    expect(result).toEqual({
      ok: false,
      error: {
        code: "sync_rejected",
        message: "expected client sequence 1, received 2",
      },
    });
    const pulled = parseSyncPullResponse(
      JSON.parse(await workspace.pullOperations(0)),
    );
    expect(pulled.operations).toEqual([]);
  });

  it("rolls back the whole batch when a later operation is rejected", async () => {
    const workspace = env.WORKSPACES.getByName("workspace-atomic");
    const batch = structuredClone(goldenPush);
    const second = structuredClone(batch.operations[0]!);
    second.operationId = "operation-2";
    second.clientSequence = 2;
    second.baseServerSequence = 99;
    second.operation.operation.id = "folder-2";
    batch.operations.push(second);

    const result = await workspace.pushOperations(parseSyncPushRequest(batch));
    expect(result).toEqual({
      ok: false,
      error: {
        code: "sync_rejected",
        message: "base server sequence is ahead of the workspace",
      },
    });
    const pulled = parseSyncPullResponse(
      JSON.parse(await workspace.pullOperations(0)),
    );
    expect(pulled.operations).toEqual([]);
  });

  it("isolates workspace logs", async () => {
    const first = env.WORKSPACES.getByName("workspace-a");
    const second = env.WORKSPACES.getByName("workspace-b");
    requirePushSuccess(
      await first.pushOperations(parseSyncPushRequest(goldenPush)),
    );

    const firstPull = parseSyncPullResponse(
      JSON.parse(await first.pullOperations(0)),
    );
    const secondPull = parseSyncPullResponse(
      JSON.parse(await second.pullOperations(0)),
    );
    expect(firstPull.operations).toHaveLength(1);
    expect(secondPull.operations).toEqual([]);
  });
});

describe("public Worker boundary", () => {
  it("reports health without exposing an unauthenticated sync route", async () => {
    const health = await exports.default.fetch("https://example.test/health");
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: "ok", publicSync: false });

    const sync = await exports.default.fetch(
      "https://example.test/v1/workspaces/workspace-1/push",
      { method: "POST" },
    );
    expect(sync.status).toBe(503);
    expect(await sync.json()).toEqual({
      error: "sync_authentication_not_configured",
    });
  });
});
