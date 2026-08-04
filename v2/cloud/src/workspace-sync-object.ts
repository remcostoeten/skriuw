import { DurableObject } from "cloudflare:workers";

import {
  MAX_SYNC_PULL_OPERATIONS,
  SyncContractError,
  type ReplicatedWorkspaceOperation,
  type SyncAcceptedOperation,
  type SyncPullResponse,
  type SyncPushRequest,
  type SyncPushResult,
  type SyncPushResponse,
  WORKSPACE_SYNC_PROTOCOL_VERSION,
  parseStoredJson,
  parseSyncPushRequest,
  parseWorkspaceOperationEnvelope,
  requireSafeSequence,
} from "./contracts";

type StoredOperationRow = {
  operation_id: string;
  device_id: string;
  client_sequence: number;
  base_server_sequence: number;
  server_sequence: number;
  operation_json: string;
};

type ExistingOperationRow = {
  device_id: string;
  client_sequence: number;
  base_server_sequence: number;
  server_sequence: number;
  operation_json: string;
};

export class WorkspaceSyncObject extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(async () => {
      this.migrate();
    });
  }

  async pushOperations(input: unknown): Promise<SyncPushResult> {
    try {
      const request = parseSyncPushRequest(input);
      const response = this.ctx.storage.transactionSync(() =>
        this.pushTransaction(request),
      );
      return { ok: true, response };
    } catch (error) {
      if (error instanceof SyncContractError) {
        return {
          ok: false,
          error: { code: error.code, message: error.message },
        };
      }
      throw error;
    }
  }

  async pullOperations(afterServerSequence: number, requestedLimit = 128): Promise<string> {
    const cursor = requireSafeSequence(afterServerSequence, "afterServerSequence", true);
    const limit = requireSafeSequence(requestedLimit, "limit", false);
    if (limit > MAX_SYNC_PULL_OPERATIONS) {
      throw new SyncContractError(`limit cannot exceed ${MAX_SYNC_PULL_OPERATIONS}`);
    }

    const rows = this.ctx.storage.sql
      .exec<StoredOperationRow>(
        "SELECT operation_id, device_id, client_sequence, base_server_sequence, " +
          "server_sequence, operation_json FROM sync_operations " +
          "WHERE server_sequence > ? ORDER BY server_sequence LIMIT ?",
        cursor,
        limit,
      )
      .toArray();
    const operations = rows.map(toReplicatedOperation);
    const response: SyncPullResponse = {
      syncProtocolVersion: WORKSPACE_SYNC_PROTOCOL_VERSION,
      operations,
      latestServerSequence: this.latestServerSequence(),
    };
    return JSON.stringify(response);
  }

  private migrate(): void {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS _sql_schema_migrations (
        id INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      ) STRICT;
    `);
    const currentVersion = this.ctx.storage.sql
      .exec<{ version: number }>(
        "SELECT COALESCE(MAX(id), 0) AS version FROM _sql_schema_migrations",
      )
      .one().version;
    if (currentVersion > 1) {
      throw new Error(`workspace sync schema ${currentVersion} is newer than this service`);
    }
    if (currentVersion === 1) {
      return;
    }
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE sync_operations (
          server_sequence INTEGER PRIMARY KEY AUTOINCREMENT,
          operation_id TEXT NOT NULL UNIQUE,
          device_id TEXT NOT NULL,
          client_sequence INTEGER NOT NULL CHECK (client_sequence > 0),
          base_server_sequence INTEGER NOT NULL CHECK (base_server_sequence >= 0),
          operation_json TEXT NOT NULL,
          UNIQUE (device_id, client_sequence)
        ) STRICT;
        CREATE INDEX sync_operations_device_sequence
          ON sync_operations(device_id, client_sequence);
        CREATE TABLE sync_device_heads (
          device_id TEXT PRIMARY KEY,
          last_client_sequence INTEGER NOT NULL CHECK (last_client_sequence >= 0)
        ) STRICT;
        INSERT INTO _sql_schema_migrations(id) VALUES (1);
      `);
    });
  }

  private pushTransaction(request: SyncPushRequest): SyncPushResponse {
    const accepted: SyncAcceptedOperation[] = [];
    for (const operation of request.operations) {
      const operationJson = JSON.stringify(operation.operation);
      const existing = this.ctx.storage.sql
        .exec<ExistingOperationRow>(
          "SELECT device_id, client_sequence, base_server_sequence, server_sequence, " +
            "operation_json FROM sync_operations WHERE operation_id = ?",
          operation.operationId,
        )
        .toArray()[0];
      if (existing !== undefined) {
        if (
          existing.device_id !== request.deviceId ||
          existing.client_sequence !== operation.clientSequence ||
          existing.base_server_sequence !== operation.baseServerSequence ||
          existing.operation_json !== operationJson
        ) {
          throw new SyncContractError(
            `operation id ${operation.operationId} was reused with different content`,
          );
        }
        accepted.push({
          operationId: operation.operationId,
          clientSequence: operation.clientSequence,
          serverSequence: existing.server_sequence,
        });
        continue;
      }

      const latestServerSequence = this.latestServerSequence();
      if (operation.baseServerSequence > latestServerSequence) {
        throw new SyncContractError("base server sequence is ahead of the workspace");
      }
      const currentDeviceSequence = this.ctx.storage.sql
        .exec<{ sequence: number }>(
          "SELECT COALESCE(MAX(last_client_sequence), 0) AS sequence " +
            "FROM sync_device_heads WHERE device_id = ?",
          request.deviceId,
        )
        .one().sequence;
      if (operation.clientSequence !== currentDeviceSequence + 1) {
        throw new SyncContractError(
          `expected client sequence ${currentDeviceSequence + 1}, received ${operation.clientSequence}`,
        );
      }

      const conflictingSequence = this.ctx.storage.sql
        .exec<{ operation_id: string }>(
          "SELECT operation_id FROM sync_operations " +
            "WHERE device_id = ? AND client_sequence = ?",
          request.deviceId,
          operation.clientSequence,
        )
        .toArray()[0];
      if (conflictingSequence !== undefined) {
        throw new SyncContractError(
          `client sequence ${operation.clientSequence} already belongs to ${conflictingSequence.operation_id}`,
        );
      }

      const serverSequence = this.ctx.storage.sql
        .exec<{ server_sequence: number }>(
          "INSERT INTO sync_operations(" +
            "operation_id, device_id, client_sequence, base_server_sequence, operation_json" +
            ") VALUES (?, ?, ?, ?, ?) RETURNING server_sequence",
          operation.operationId,
          request.deviceId,
          operation.clientSequence,
          operation.baseServerSequence,
          operationJson,
        )
        .one().server_sequence;
      this.ctx.storage.sql.exec(
        "INSERT INTO sync_device_heads(device_id, last_client_sequence) VALUES (?, ?) " +
          "ON CONFLICT(device_id) DO UPDATE SET last_client_sequence = excluded.last_client_sequence",
        request.deviceId,
        operation.clientSequence,
      );
      accepted.push({
        operationId: operation.operationId,
        clientSequence: operation.clientSequence,
        serverSequence,
      });
    }
    return {
      syncProtocolVersion: WORKSPACE_SYNC_PROTOCOL_VERSION,
      accepted,
      latestServerSequence: this.latestServerSequence(),
    };
  }

  private latestServerSequence(): number {
    return this.ctx.storage.sql
      .exec<{ sequence: number }>(
        "SELECT COALESCE(MAX(server_sequence), 0) AS sequence FROM sync_operations",
      )
      .one().sequence;
  }
}

function toReplicatedOperation(row: StoredOperationRow): ReplicatedWorkspaceOperation {
  const envelope = parseWorkspaceOperationEnvelope(parseStoredJson(row.operation_json));
  return {
    operationId: row.operation_id,
    deviceId: row.device_id,
    clientSequence: row.client_sequence,
    baseServerSequence: row.base_server_sequence,
    serverSequence: row.server_sequence,
    operation: envelope,
  };
}
