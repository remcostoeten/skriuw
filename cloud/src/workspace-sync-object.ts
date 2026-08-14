import { DurableObject } from "cloudflare:workers";

import { WorkspaceContentStore } from "./content-store";
import {
  SYNC_EVENTS_DEVICE_HEADER,
  SYNC_EVENTS_EXPIRY_HEADER,
} from "./public-api";
import {
  type AcknowledgementResult,
  type CompactionResult,
  type ContentManifest,
  type SyncOperationPayload,
  MAX_RETAINED_CHECKPOINTS,
  MAX_SYNC_PULL_OPERATIONS,
  SyncContractError,
  type ReplicatedWorkspaceOperation,
  type SyncAcceptedOperation,
  type SyncPullResponse,
  type SyncPushRequest,
  type SyncPushResult,
  type SyncPushResponse,
  WORKSPACE_SYNC_PROTOCOL_VERSION,
  type WorkspaceCheckpointRecord,
  parseStoredJson,
  parseSyncOperationPayload,
  parseSyncPushRequest,
  parseWorkspaceCheckpoint,
  requireIdentifier,
  requireSafeSequence,
} from "./contracts";

type StoredOperationRow = {
  operation_id: string;
  device_id: string;
  client_sequence: number;
  base_server_sequence: number;
  server_sequence: number;
  payload_json: string;
};

type ExistingOperationRow = {
  device_id: string;
  client_sequence: number;
  base_server_sequence: number;
  server_sequence: number;
  payload_json: string;
};

type EventsSocketAttachment = {
  deviceId: string;
  expiresAtEpochSeconds: number;
};

export class WorkspaceSyncObject extends DurableObject<Env> {
  private readonly content: WorkspaceContentStore;
  private readonly workspaceKey: string;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.content = new WorkspaceContentStore(env.SYNC_CONTENT);
    this.workspaceKey = ctx.id.name ?? "";
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    void ctx.blockConcurrencyWhile(async () => {
      this.migrate();
    });
  }

  /**
   * Accepts the events WebSocket forwarded by the Worker after authorization.
   * The socket hibernates between broadcasts; the device identity and session
   * expiry ride the attachment so they survive eviction.
   */
  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return Response.json({ error: "upgrade_required" }, { status: 426 });
    }
    const deviceId = request.headers.get(SYNC_EVENTS_DEVICE_HEADER);
    const expiresAtEpochSeconds = Number(
      request.headers.get(SYNC_EVENTS_EXPIRY_HEADER),
    );
    if (!deviceId || !Number.isSafeInteger(expiresAtEpochSeconds) || expiresAtEpochSeconds <= 0) {
      return Response.json({ error: "invalid_request" }, { status: 400 });
    }
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({
      deviceId,
      expiresAtEpochSeconds,
    } satisfies EventsSocketAttachment);
    const headers = new Headers();
    const subprotocol = request.headers.get("Sec-WebSocket-Protocol");
    if (subprotocol !== null) {
      headers.set("Sec-WebSocket-Protocol", subprotocol);
    }
    return new Response(null, { status: 101, webSocket: pair[0], headers });
  }

  override async webSocketMessage(): Promise<void> {
    // Clients never send application messages; keepalive pings are answered
    // by the auto-response pair without waking the object.
  }

  override async webSocketClose(socket: WebSocket): Promise<void> {
    closeQuietly(socket);
  }

  override async webSocketError(socket: WebSocket): Promise<void> {
    closeQuietly(socket);
  }

  async pushOperations(input: unknown): Promise<SyncPushResult> {
    try {
      const request = parseSyncPushRequest(input);
      const missing = await this.missingPushContent(request);
      if (missing.length > 0) {
        return {
          ok: false,
          error: {
            code: "content_unavailable",
            message: `chunked content is not stored: ${missing.join(",")}`,
          },
        };
      }
      const response = this.ctx.storage.transactionSync(() =>
        this.pushTransaction(request),
      );
      this.broadcastWorkspaceChanged(response.latestServerSequence, request.deviceId);
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
          "server_sequence, payload_json FROM sync_operations " +
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
    if (currentVersion > 2) {
      throw new Error(`workspace sync schema ${currentVersion} is newer than this service`);
    }
    if (currentVersion === 2) {
      return;
    }
    if (currentVersion === 0) {
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
    this.upgradeStoredOperationsToPayloads();
  }

  private upgradeStoredOperationsToPayloads(): void {
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        "ALTER TABLE sync_operations RENAME COLUMN operation_json TO payload_json",
      );
      const rows = this.ctx.storage.sql
        .exec<{ server_sequence: number; payload_json: string }>(
          "SELECT server_sequence, payload_json FROM sync_operations",
        )
        .toArray();
      for (const row of rows) {
        this.ctx.storage.sql.exec(
          "UPDATE sync_operations SET payload_json = ? WHERE server_sequence = ?",
          JSON.stringify({
            form: "inline",
            operation: parseStoredJson(row.payload_json),
          }),
          row.server_sequence,
        );
      }
      this.ctx.storage.sql.exec("INSERT INTO _sql_schema_migrations(id) VALUES (2)");
    });
    this.createContentTables();
  }

  private createContentTables(): void {
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS sync_chunk_refs (
          digest TEXT NOT NULL,
          ref_kind TEXT NOT NULL CHECK (ref_kind IN ('operation', 'checkpoint')),
          ref_id TEXT NOT NULL,
          PRIMARY KEY (digest, ref_kind, ref_id)
        ) STRICT;
        CREATE INDEX IF NOT EXISTS sync_chunk_refs_target
          ON sync_chunk_refs(ref_kind, ref_id);
        CREATE TABLE IF NOT EXISTS sync_checkpoints (
          server_sequence INTEGER PRIMARY KEY,
          checkpoint_json TEXT NOT NULL,
          created_at INTEGER NOT NULL CHECK (created_at >= 0)
        ) STRICT;
        CREATE TABLE IF NOT EXISTS sync_device_cursors (
          device_id TEXT PRIMARY KEY,
          acknowledged_server_sequence INTEGER NOT NULL CHECK (
            acknowledged_server_sequence >= 0
          ),
          updated_at INTEGER NOT NULL CHECK (updated_at >= 0)
        ) STRICT;
      `);
    });
  }

  /**
   * An operation is never appended while any chunk it references is missing,
   * so a published log entry always resolves to available content.
   */
  private async missingPushContent(request: SyncPushRequest): Promise<string[]> {
    const missing = new Set<string>();
    for (const operation of request.operations) {
      for (const manifest of referencedManifests(operation.payload)) {
        for (const digest of await this.content.missingChunks(this.workspaceKey, manifest)) {
          missing.add(digest);
        }
      }
    }
    return [...missing].sort();
  }

  async acknowledgeOperations(
    deviceId: string,
    serverSequence: number,
    nowEpochSeconds: number,
  ): Promise<AcknowledgementResult> {
    const device = requireIdentifier(deviceId, "deviceId");
    const cursor = requireSafeSequence(serverSequence, "serverSequence", true);
    const updatedAt = requireSafeSequence(nowEpochSeconds, "nowEpochSeconds", true);
    if (cursor > this.latestServerSequence()) {
      return { ok: false, code: "sequence_ahead_of_workspace" };
    }
    return this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        "INSERT INTO sync_device_cursors(device_id, acknowledged_server_sequence, updated_at) " +
          "VALUES (?, ?, ?) ON CONFLICT(device_id) DO UPDATE SET " +
          "acknowledged_server_sequence = MAX(acknowledged_server_sequence, excluded.acknowledged_server_sequence), " +
          "updated_at = excluded.updated_at",
        device,
        cursor,
        updatedAt,
      );
      return {
        ok: true,
        acknowledgedServerSequence: this.ctx.storage.sql
          .exec<{ sequence: number }>(
            "SELECT acknowledged_server_sequence AS sequence FROM sync_device_cursors WHERE device_id = ?",
            device,
          )
          .one().sequence,
      };
    });
  }

  /**
   * Publication is atomic from a client's perspective: the record is only
   * written after every referenced chunk is confirmed stored, so an incomplete
   * checkpoint is never discoverable as current.
   */
  async publishCheckpoint(input: unknown): Promise<
    { ok: true; serverSequence: number } | { ok: false; code: string; message: string }
  > {
    let checkpoint: WorkspaceCheckpointRecord;
    try {
      checkpoint = parseWorkspaceCheckpoint(input);
    } catch (error) {
      if (error instanceof SyncContractError) {
        return { ok: false, code: error.code, message: error.message };
      }
      throw error;
    }
    if (checkpoint.serverSequence > this.latestServerSequence()) {
      return {
        ok: false,
        code: "sync_rejected",
        message: "checkpoint sequence is ahead of the workspace",
      };
    }
    const missing = await this.content.missingChunks(this.workspaceKey, checkpoint.content);
    if (missing.length > 0) {
      return {
        ok: false,
        code: "content_unavailable",
        message: `checkpoint content is not stored: ${missing.join(",")}`,
      };
    }

    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        "INSERT INTO sync_checkpoints(server_sequence, checkpoint_json, created_at) " +
          "VALUES (?, ?, ?) ON CONFLICT(server_sequence) DO UPDATE SET " +
          "checkpoint_json = excluded.checkpoint_json, created_at = excluded.created_at",
        checkpoint.serverSequence,
        JSON.stringify(checkpoint),
        checkpoint.createdAt,
      );
      for (const digest of new Set(checkpoint.content.chunks.map((chunk) => chunk.digest))) {
        this.ctx.storage.sql.exec(
          "INSERT OR IGNORE INTO sync_chunk_refs(digest, ref_kind, ref_id) VALUES (?, 'checkpoint', ?)",
          digest,
          String(checkpoint.serverSequence),
        );
      }
    });
    this.broadcastWorkspaceChanged(this.latestServerSequence(), null);
    return { ok: true, serverSequence: checkpoint.serverSequence };
  }

  /**
   * A wake hint only: recipients pull through the normal path, so a lost or
   * failed send costs nothing but latency. Sockets whose session expired are
   * closed here because hibernation keeps them alive past the handshake check.
   */
  private broadcastWorkspaceChanged(
    latestServerSequence: number,
    originDeviceId: string | null,
  ): void {
    const nowEpochSeconds = Math.floor(Date.now() / 1_000);
    const message = JSON.stringify({ type: "workspaceChanged", latestServerSequence });
    for (const socket of this.ctx.getWebSockets()) {
      let attachment: EventsSocketAttachment | null = null;
      try {
        attachment = socket.deserializeAttachment() as EventsSocketAttachment;
      } catch {
        closeQuietly(socket);
        continue;
      }
      if (attachment.expiresAtEpochSeconds <= nowEpochSeconds) {
        closeQuietly(socket);
        continue;
      }
      if (originDeviceId !== null && attachment.deviceId === originDeviceId) {
        continue;
      }
      try {
        socket.send(message);
      } catch {
        closeQuietly(socket);
      }
    }
  }

  async latestCheckpoint(): Promise<string | null> {
    const row = this.ctx.storage.sql
      .exec<{ checkpoint_json: string }>(
        "SELECT checkpoint_json FROM sync_checkpoints ORDER BY server_sequence DESC LIMIT 1",
      )
      .toArray()[0];
    return row?.checkpoint_json ?? null;
  }

  /**
   * Removes log entries and chunks that no retained checkpoint, active device
   * cursor, or newer operation still needs. Without a retained checkpoint
   * nothing is removable, because a new device would still have to replay the
   * log from zero.
   */
  async compact(
    nowEpochSeconds: number,
    maxDeviceIdleSeconds: number,
  ): Promise<CompactionResult> {
    const now = requireSafeSequence(nowEpochSeconds, "nowEpochSeconds", true);
    const idle = requireSafeSequence(maxDeviceIdleSeconds, "maxDeviceIdleSeconds", true);

    const plan = this.ctx.storage.transactionSync(() => {
      const expiredDevices = this.ctx.storage.sql
        .exec<{ device_id: string }>(
          "DELETE FROM sync_device_cursors WHERE updated_at < ? RETURNING device_id",
          Math.max(0, now - idle),
        )
        .toArray().length;

      const candidates = new Set<string>();
      const retained = this.ctx.storage.sql
        .exec<{ server_sequence: number }>(
          "SELECT server_sequence FROM sync_checkpoints ORDER BY server_sequence DESC LIMIT ?",
          MAX_RETAINED_CHECKPOINTS,
        )
        .toArray()
        .map((row) => row.server_sequence);

      let removedCheckpoints = 0;
      if (retained.length > 0) {
        const oldestRetained = Math.min(...retained);
        const superseded = this.ctx.storage.sql
          .exec<{ server_sequence: number }>(
            "DELETE FROM sync_checkpoints WHERE server_sequence < ? RETURNING server_sequence",
            oldestRetained,
          )
          .toArray();
        removedCheckpoints = superseded.length;
        for (const row of superseded) {
          this.collectReferencedDigests(candidates, "checkpoint", String(row.server_sequence));
          this.ctx.storage.sql.exec(
            "DELETE FROM sync_chunk_refs WHERE ref_kind = 'checkpoint' AND ref_id = ?",
            String(row.server_sequence),
          );
        }
      }

      const cursors = this.ctx.storage.sql
        .exec<{ sequence: number }>(
          "SELECT acknowledged_server_sequence AS sequence FROM sync_device_cursors",
        )
        .toArray()
        .map((row) => row.sequence);
      const hydratableFrom = retained.length === 0 ? 0 : Math.min(...retained);
      const acknowledgedEverywhere = cursors.length === 0 ? 0 : Math.min(...cursors);
      const compactBelow = Math.min(hydratableFrom, acknowledgedEverywhere);

      let removedOperations = 0;
      if (compactBelow > 0) {
        const superseded = this.ctx.storage.sql
          .exec<{ operation_id: string }>(
            "DELETE FROM sync_operations WHERE server_sequence <= ? RETURNING operation_id",
            compactBelow,
          )
          .toArray();
        removedOperations = superseded.length;
        for (const row of superseded) {
          this.collectReferencedDigests(candidates, "operation", row.operation_id);
          this.ctx.storage.sql.exec(
            "DELETE FROM sync_chunk_refs WHERE ref_kind = 'operation' AND ref_id = ?",
            row.operation_id,
          );
        }
      }

      const orphaned = [...candidates].filter((digest) => !this.isChunkReferenced(digest));
      return { expiredDevices, removedCheckpoints, removedOperations, orphaned };
    });

    await this.content.deleteChunks(this.workspaceKey, plan.orphaned);
    return {
      expiredDevices: plan.expiredDevices,
      removedCheckpoints: plan.removedCheckpoints,
      removedOperations: plan.removedOperations,
      removedChunks: plan.orphaned.length,
    };
  }

  private collectReferencedDigests(
    into: Set<string>,
    refKind: "operation" | "checkpoint",
    refId: string,
  ): void {
    for (const row of this.ctx.storage.sql
      .exec<{ digest: string }>(
        "SELECT digest FROM sync_chunk_refs WHERE ref_kind = ? AND ref_id = ?",
        refKind,
        refId,
      )
      .toArray()) {
      into.add(row.digest);
    }
  }

  private isChunkReferenced(digest: string): boolean {
    return (
      this.ctx.storage.sql
        .exec<{ count: number }>(
          "SELECT COUNT(*) AS count FROM sync_chunk_refs WHERE digest = ?",
          digest,
        )
        .one().count > 0
    );
  }

  private pushTransaction(request: SyncPushRequest): SyncPushResponse {
    const accepted: SyncAcceptedOperation[] = [];
    for (const operation of request.operations) {
      const payloadJson = JSON.stringify(operation.payload);
      const existing = this.ctx.storage.sql
        .exec<ExistingOperationRow>(
          "SELECT device_id, client_sequence, base_server_sequence, server_sequence, " +
            "payload_json FROM sync_operations WHERE operation_id = ?",
          operation.operationId,
        )
        .toArray()[0];
      if (existing !== undefined) {
        if (
          existing.device_id !== request.deviceId ||
          existing.client_sequence !== operation.clientSequence ||
          existing.base_server_sequence !== operation.baseServerSequence ||
          existing.payload_json !== payloadJson
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
            "operation_id, device_id, client_sequence, base_server_sequence, payload_json" +
            ") VALUES (?, ?, ?, ?, ?) RETURNING server_sequence",
          operation.operationId,
          request.deviceId,
          operation.clientSequence,
          operation.baseServerSequence,
          payloadJson,
        )
        .one().server_sequence;
      this.ctx.storage.sql.exec(
        "INSERT INTO sync_device_heads(device_id, last_client_sequence) VALUES (?, ?) " +
          "ON CONFLICT(device_id) DO UPDATE SET last_client_sequence = excluded.last_client_sequence",
        request.deviceId,
        operation.clientSequence,
      );
      const referencedDigests = new Set(
        referencedManifests(operation.payload).flatMap((manifest) =>
          manifest.chunks.map((chunk) => chunk.digest),
        ),
      );
      for (const digest of referencedDigests) {
        this.ctx.storage.sql.exec(
          "INSERT OR IGNORE INTO sync_chunk_refs(digest, ref_kind, ref_id) VALUES (?, 'operation', ?)",
          digest,
          operation.operationId,
        );
      }
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

  /**
   * The log's high-water mark must survive compaction: sync_operations uses
   * AUTOINCREMENT, so sqlite_sequence retains the last assigned sequence even
   * after retention deletes every row. Reading MAX(server_sequence) alone
   * would regress the mark and permanently reject every device's
   * acknowledgements and pushes.
   */
  private latestServerSequence(): number {
    const logged = this.ctx.storage.sql
      .exec<{ sequence: number }>(
        "SELECT COALESCE(MAX(server_sequence), 0) AS sequence FROM sync_operations",
      )
      .one().sequence;
    const assigned = this.ctx.storage.sql
      .exec<{ sequence: number }>(
        "SELECT COALESCE(MAX(seq), 0) AS sequence FROM sqlite_sequence WHERE name = 'sync_operations'",
      )
      .toArray()[0]?.sequence ?? 0;
    return Math.max(logged, assigned);
  }
}

function closeQuietly(socket: WebSocket): void {
  try {
    socket.close(1011, "sync events channel closed");
  } catch {
    // Already closed or errored; hibernation cleans the socket up regardless.
  }
}

function referencedManifests(payload: SyncOperationPayload): ContentManifest[] {
  if (payload.form === "chunked") {
    return [payload.manifest];
  }
  return payload.assets ?? [];
}

function toReplicatedOperation(row: StoredOperationRow): ReplicatedWorkspaceOperation {
  return {
    operationId: row.operation_id,
    deviceId: row.device_id,
    clientSequence: row.client_sequence,
    baseServerSequence: row.base_server_sequence,
    serverSequence: row.server_sequence,
    payload: parseSyncOperationPayload(parseStoredJson(row.payload_json)),
  };
}
