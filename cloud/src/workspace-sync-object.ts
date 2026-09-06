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
  MAX_SYNC_PULL_PAGE_BYTES,
  MAX_WORKSPACE_STORAGE_BYTES,
  SyncContractError,
  type ReplicatedWorkspaceOperation,
  type SyncAcceptedOperation,
  type SyncPullResponse,
  type SyncPullResult,
  type SyncPushRequest,
  type SyncPushResult,
  type SyncPushResponse,
  UNREFERENCED_CHUNK_GRACE_SECONDS,
  WORKSPACE_SYNC_PROTOCOL_VERSION,
  type WorkspaceCheckpointRecord,
  type WorkspaceStorageUsage,
  type WorkspaceSyncState,
  jsonByteLength,
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

type IndexedOperationRow = {
  device_id: string;
  client_sequence: number;
  operation_id: string;
  server_sequence: number;
  base_server_sequence: number;
  payload_sha256: string;
};

type LogFloorRow = {
  compacted_through: number;
  checkpoint_server_sequence: number;
};

type HashedPushOperation = {
  operation: SyncPushRequest["operations"][number];
  payloadJson: string;
  payloadSha256: string;
};

type EventsSocketAttachment = {
  deviceId: string;
  expiresAtEpochSeconds: number;
};

type CompactionPlan = {
  expiredDevices: number;
  removedCheckpoints: number;
  removedOperations: number;
  deleting: string[];
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
      await this.migrate();
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
    await this.scheduleExpiryAlarm(expiresAtEpochSeconds);
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

  /**
   * Revoked or expired sessions must not keep receiving wake hints; the alarm
   * closes every socket whose session expiry has passed and re-arms for the
   * next one so a hibernating object never needs a broadcast to notice.
   */
  override async alarm(): Promise<void> {
    const nowEpochSeconds = Math.floor(Date.now() / 1_000);
    let nextExpiry: number | null = null;
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = readAttachment(socket);
      if (attachment === null || attachment.expiresAtEpochSeconds <= nowEpochSeconds) {
        closeQuietly(socket);
        continue;
      }
      nextExpiry =
        nextExpiry === null
          ? attachment.expiresAtEpochSeconds
          : Math.min(nextExpiry, attachment.expiresAtEpochSeconds);
    }
    if (nextExpiry !== null) {
      await this.ctx.storage.setAlarm(nextExpiry * 1_000);
    }
  }

  private async scheduleExpiryAlarm(expiresAtEpochSeconds: number): Promise<void> {
    const expiresAtMs = expiresAtEpochSeconds * 1_000;
    const scheduled = await this.ctx.storage.getAlarm();
    if (scheduled === null || expiresAtMs < scheduled) {
      await this.ctx.storage.setAlarm(expiresAtMs);
    }
  }

  /**
   * Content is verified only for operations not already committed: an
   * identical retry of an indexed operation is answered from the index even
   * after retention removed its log row and chunks.
   */
  async pushOperations(input: unknown): Promise<SyncPushResult> {
    try {
      const request = parseSyncPushRequest(input);
      const hashed = await Promise.all(
        request.operations.map(async (operation): Promise<HashedPushOperation> => {
          const payloadJson = JSON.stringify(operation.payload);
          return { operation, payloadJson, payloadSha256: await sha256Hex(payloadJson) };
        }),
      );
      const pending = hashed
        .filter((entry) => !this.isIndexedIdentical(request.deviceId, entry))
        .map((entry) => entry.operation);
      const missing = await this.missingPushContent(pending);
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
        this.pushTransaction(request.deviceId, hashed),
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

  /**
   * A page is bounded by both a row cap and a serialized byte budget so one
   * response never exceeds what a client can buffer; the first operation is
   * always included so a large entry cannot stall a cursor forever.
   */
  async pullOperations(afterServerSequence: number, requestedLimit = 128): Promise<SyncPullResult> {
    const cursor = requireSafeSequence(afterServerSequence, "afterServerSequence", true);
    const limit = requireSafeSequence(requestedLimit, "limit", false);
    if (limit > MAX_SYNC_PULL_OPERATIONS) {
      throw new SyncContractError(`limit cannot exceed ${MAX_SYNC_PULL_OPERATIONS}`);
    }
    const floor = this.logFloor();
    if (cursor < floor.compacted_through) {
      return {
        ok: false,
        code: "log_truncated",
        compactedThrough: floor.compacted_through,
        checkpointServerSequence: floor.checkpoint_server_sequence,
      };
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
    const latestServerSequence = this.latestServerSequence();
    const envelopeBytes = jsonByteLength({
      syncProtocolVersion: WORKSPACE_SYNC_PROTOCOL_VERSION,
      operations: [],
      latestServerSequence,
    });
    const operations: ReplicatedWorkspaceOperation[] = [];
    let pageBytes = envelopeBytes;
    for (const row of rows) {
      const operation = toReplicatedOperation(row);
      const operationBytes = jsonByteLength(operation) + 1;
      if (operations.length > 0 && pageBytes + operationBytes > MAX_SYNC_PULL_PAGE_BYTES) {
        break;
      }
      operations.push(operation);
      pageBytes += operationBytes;
    }
    const response: SyncPullResponse = {
      syncProtocolVersion: WORKSPACE_SYNC_PROTOCOL_VERSION,
      operations,
      latestServerSequence,
    };
    return { ok: true, responseJson: JSON.stringify(response) };
  }

  async workspaceState(): Promise<WorkspaceSyncState> {
    return {
      latestServerSequence: this.latestServerSequence(),
      compactedThrough: this.logFloor().compacted_through,
    };
  }

  async storageUsage(): Promise<WorkspaceStorageUsage> {
    return {
      byteLength: this.storageUsageBytes(),
      quotaBytes: MAX_WORKSPACE_STORAGE_BYTES,
    };
  }

  /**
   * Idempotent per digest: an identical re-upload of stored bytes never counts
   * twice, and a chunk counts again only after retention removed it.
   */
  async recordChunkUpload(digest: string, byteLength: number): Promise<WorkspaceStorageUsage> {
    const size = requireSafeSequence(byteLength, "byteLength", false);
    const usage = this.ctx.storage.transactionSync(() => {
      const known = this.ctx.storage.sql
        .exec<{ count: number }>(
          "SELECT COUNT(*) AS count FROM sync_chunk_sizes WHERE digest = ?",
          digest,
        )
        .one().count;
      if (known === 0) {
        this.ctx.storage.sql.exec(
          "INSERT INTO sync_chunk_sizes(digest, byte_length) VALUES (?, ?)",
          digest,
          size,
        );
        this.ctx.storage.sql.exec(
          "UPDATE sync_storage_usage SET byte_length = byte_length + ? WHERE id = 1",
          size,
        );
      }
      return this.storageUsageBytes();
    });
    return { byteLength: usage, quotaBytes: MAX_WORKSPACE_STORAGE_BYTES };
  }

  private async migrate(): Promise<void> {
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
    if (currentVersion > 3) {
      throw new Error(`workspace sync schema ${currentVersion} is newer than this service`);
    }
    if (currentVersion === 3) {
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
    if (currentVersion < 2) {
      this.upgradeStoredOperationsToPayloads();
    }
    this.createContentTables();
    await this.createRetentionTables();
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
   * Migration 3 backfills the compaction-immune operation index from the
   * rows still in the log; entries already compacted before this migration
   * cannot be recovered and their retries fall through to the sequence check.
   */
  private async createRetentionTables(): Promise<void> {
    const logged = this.ctx.storage.sql
      .exec<StoredOperationRow>(
        "SELECT operation_id, device_id, client_sequence, base_server_sequence, " +
          "server_sequence, payload_json FROM sync_operations ORDER BY server_sequence",
      )
      .toArray();
    const indexed = await Promise.all(
      logged.map(async (row) => ({ row, payloadSha256: await sha256Hex(row.payload_json) })),
    );
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE sync_log_floor (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          compacted_through INTEGER NOT NULL CHECK (compacted_through >= 0),
          checkpoint_server_sequence INTEGER NOT NULL CHECK (checkpoint_server_sequence >= 0),
          compacted_at INTEGER NOT NULL CHECK (compacted_at >= 0)
        ) STRICT;
        INSERT INTO sync_log_floor(id, compacted_through, checkpoint_server_sequence, compacted_at)
          VALUES (1, 0, 0, 0);
        CREATE TABLE sync_operation_index (
          device_id TEXT NOT NULL,
          client_sequence INTEGER NOT NULL CHECK (client_sequence > 0),
          operation_id TEXT NOT NULL UNIQUE,
          server_sequence INTEGER NOT NULL CHECK (server_sequence > 0),
          base_server_sequence INTEGER NOT NULL CHECK (base_server_sequence >= 0),
          payload_sha256 TEXT NOT NULL,
          PRIMARY KEY (device_id, client_sequence)
        ) STRICT;
        CREATE TABLE sync_chunk_deleting (
          digest TEXT PRIMARY KEY,
          marked_at INTEGER NOT NULL CHECK (marked_at >= 0)
        ) STRICT;
        CREATE TABLE sync_chunk_sizes (
          digest TEXT PRIMARY KEY,
          byte_length INTEGER NOT NULL CHECK (byte_length > 0)
        ) STRICT;
        CREATE TABLE sync_storage_usage (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          byte_length INTEGER NOT NULL CHECK (byte_length >= 0)
        ) STRICT;
        INSERT INTO sync_storage_usage(id, byte_length) VALUES (1, 0);
      `);
      for (const { row, payloadSha256 } of indexed) {
        this.ctx.storage.sql.exec(
          "INSERT INTO sync_operation_index(" +
            "device_id, client_sequence, operation_id, server_sequence, base_server_sequence, payload_sha256" +
            ") VALUES (?, ?, ?, ?, ?, ?)",
          row.device_id,
          row.client_sequence,
          row.operation_id,
          row.server_sequence,
          row.base_server_sequence,
          payloadSha256,
        );
      }
      this.ctx.storage.sql.exec("INSERT INTO _sql_schema_migrations(id) VALUES (3)");
    });
  }

  /**
   * An operation is never appended while any chunk it references is missing,
   * so a published log entry always resolves to available content.
   */
  private async missingPushContent(
    operations: readonly SyncPushRequest["operations"][number][],
  ): Promise<string[]> {
    const missing = new Set<string>();
    for (const operation of operations) {
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
   * written after every referenced chunk is confirmed stored and, inside the
   * same transaction that records the references, confirmed not marked for
   * deletion, so an incomplete checkpoint is never discoverable as current.
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

    const digests = new Set(checkpoint.content.chunks.map((chunk) => chunk.digest));
    return this.ctx.storage.transactionSync(() => {
      if (checkpoint.serverSequence < this.logFloor().compacted_through) {
        return {
          ok: false,
          code: "sync_rejected",
          message: "checkpoint sequence is below the compaction floor",
        };
      }
      const deleting = this.digestsMarkedForDeletion(digests);
      if (deleting.length > 0) {
        return {
          ok: false,
          code: "content_unavailable",
          message: `checkpoint content is being removed: ${deleting.join(",")}`,
        };
      }
      this.ctx.storage.sql.exec(
        "INSERT INTO sync_checkpoints(server_sequence, checkpoint_json, created_at) " +
          "VALUES (?, ?, ?) ON CONFLICT(server_sequence) DO UPDATE SET " +
          "checkpoint_json = excluded.checkpoint_json, created_at = excluded.created_at",
        checkpoint.serverSequence,
        JSON.stringify(checkpoint),
        checkpoint.createdAt,
      );
      for (const digest of digests) {
        this.ctx.storage.sql.exec(
          "INSERT OR IGNORE INTO sync_chunk_refs(digest, ref_kind, ref_id) VALUES (?, 'checkpoint', ?)",
          digest,
          String(checkpoint.serverSequence),
        );
      }
      return { ok: true, serverSequence: checkpoint.serverSequence };
    });
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
      const attachment = readAttachment(socket);
      if (attachment === null || attachment.expiresAtEpochSeconds <= nowEpochSeconds) {
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
   * log from zero. Chunk removal is two-phase: a digest is marked in
   * sync_chunk_deleting inside the planning transaction, which makes every
   * concurrent push or checkpoint publication that references it fail closed,
   * and the mark is cleared only after the object store confirmed the delete.
   */
  async compact(
    nowEpochSeconds: number,
    maxDeviceIdleSeconds: number,
  ): Promise<CompactionResult> {
    const now = requireSafeSequence(nowEpochSeconds, "nowEpochSeconds", true);
    const idle = requireSafeSequence(maxDeviceIdleSeconds, "maxDeviceIdleSeconds", true);

    const plan = this.ctx.storage.transactionSync(() => this.planCompaction(now, idle));
    await this.content.deleteChunks(this.workspaceKey, plan.deleting);
    this.ctx.storage.transactionSync(() => this.finishChunkDeletion(plan.deleting));

    const swept = await this.sweepUnreferencedChunks(now);
    return {
      expiredDevices: plan.expiredDevices,
      removedCheckpoints: plan.removedCheckpoints,
      removedOperations: plan.removedOperations,
      removedChunks: plan.deleting.length + swept,
    };
  }

  private planCompaction(now: number, idle: number): CompactionPlan {
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
      this.raiseLogFloor(compactBelow, Math.max(...retained), hydratableFrom, now);
    }

    const orphaned = [...candidates].filter((digest) => !this.isChunkReferenced(digest));
    for (const digest of orphaned) {
      this.markChunkDeleting(digest, now);
    }
    const deleting = this.ctx.storage.sql
      .exec<{ digest: string }>("SELECT digest FROM sync_chunk_deleting ORDER BY digest")
      .toArray()
      .map((row) => row.digest);
    return { expiredDevices, removedCheckpoints, removedOperations, deleting };
  }

  /**
   * The floor only ever rises, and it must stay at or below the oldest
   * retained checkpoint: a device below the floor recovers by hydrating from a
   * checkpoint and pulling from there, which is impossible if the checkpoint
   * itself sits below the floor.
   */
  private raiseLogFloor(
    compactedThrough: number,
    checkpointServerSequence: number,
    oldestRetainedCheckpoint: number,
    now: number,
  ): void {
    this.ctx.storage.sql.exec(
      "UPDATE sync_log_floor SET " +
        "compacted_through = MAX(compacted_through, ?), " +
        "checkpoint_server_sequence = ?, compacted_at = ? WHERE id = 1",
      compactedThrough,
      checkpointServerSequence,
      now,
    );
    const floor = this.logFloor();
    if (floor.compacted_through > oldestRetainedCheckpoint) {
      throw new Error(
        `compaction floor ${floor.compacted_through} exceeds retained checkpoint ${oldestRetainedCheckpoint}`,
      );
    }
  }

  private markChunkDeleting(digest: string, now: number): void {
    this.ctx.storage.sql.exec(
      "INSERT OR IGNORE INTO sync_chunk_deleting(digest, marked_at) VALUES (?, ?)",
      digest,
      now,
    );
  }

  private finishChunkDeletion(digests: readonly string[]): void {
    for (const digest of digests) {
      const removed = this.ctx.storage.sql
        .exec<{ byte_length: number }>(
          "DELETE FROM sync_chunk_sizes WHERE digest = ? RETURNING byte_length",
          digest,
        )
        .toArray()[0];
      if (removed !== undefined) {
        this.ctx.storage.sql.exec(
          "UPDATE sync_storage_usage SET byte_length = MAX(0, byte_length - ?) WHERE id = 1",
          removed.byte_length,
        );
      }
      this.ctx.storage.sql.exec("DELETE FROM sync_chunk_deleting WHERE digest = ?", digest);
    }
  }

  /**
   * Uploads that never became referenced (abandoned pushes, rejected
   * checkpoints) are reclaimed after a grace window long enough for any
   * in-flight upload-then-push sequence to complete. The reference check is
   * repeated inside the marking transaction so a push that referenced the
   * chunk after the listing keeps it.
   */
  private async sweepUnreferencedChunks(now: number): Promise<number> {
    const stored = await this.content.listChunks(this.workspaceKey);
    const stale = stored.filter(
      (chunk) => chunk.uploadedAtEpochSeconds + UNREFERENCED_CHUNK_GRACE_SECONDS <= now,
    );
    if (stale.length === 0) {
      return 0;
    }
    const deleting = this.ctx.storage.transactionSync(() => {
      const marked: string[] = [];
      for (const chunk of stale) {
        if (this.isChunkReferenced(chunk.digest) || this.isChunkMarkedDeleting(chunk.digest)) {
          continue;
        }
        this.markChunkDeleting(chunk.digest, now);
        marked.push(chunk.digest);
      }
      return marked;
    });
    if (deleting.length === 0) {
      return 0;
    }
    await this.content.deleteChunks(this.workspaceKey, deleting);
    this.ctx.storage.transactionSync(() => this.finishChunkDeletion(deleting));
    return deleting.length;
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

  private isChunkMarkedDeleting(digest: string): boolean {
    return (
      this.ctx.storage.sql
        .exec<{ count: number }>(
          "SELECT COUNT(*) AS count FROM sync_chunk_deleting WHERE digest = ?",
          digest,
        )
        .one().count > 0
    );
  }

  private digestsMarkedForDeletion(digests: Iterable<string>): string[] {
    return [...digests].filter((digest) => this.isChunkMarkedDeleting(digest)).sort();
  }

  private logFloor(): LogFloorRow {
    return this.ctx.storage.sql
      .exec<LogFloorRow>(
        "SELECT compacted_through, checkpoint_server_sequence FROM sync_log_floor WHERE id = 1",
      )
      .one();
  }

  private storageUsageBytes(): number {
    return this.ctx.storage.sql
      .exec<{ byte_length: number }>("SELECT byte_length FROM sync_storage_usage WHERE id = 1")
      .one().byte_length;
  }

  private indexedOperation(
    deviceId: string,
    operation: HashedPushOperation["operation"],
  ): IndexedOperationRow | undefined {
    return this.ctx.storage.sql
      .exec<IndexedOperationRow>(
        "SELECT device_id, client_sequence, operation_id, server_sequence, " +
          "base_server_sequence, payload_sha256 FROM sync_operation_index " +
          "WHERE operation_id = ? OR (device_id = ? AND client_sequence = ?)",
        operation.operationId,
        deviceId,
        operation.clientSequence,
      )
      .toArray()[0];
  }

  private isIndexedIdentical(deviceId: string, entry: HashedPushOperation): boolean {
    const indexed = this.indexedOperation(deviceId, entry.operation);
    return (
      indexed !== undefined &&
      indexed.operation_id === entry.operation.operationId &&
      indexed.device_id === deviceId &&
      indexed.client_sequence === entry.operation.clientSequence &&
      indexed.base_server_sequence === entry.operation.baseServerSequence &&
      indexed.payload_sha256 === entry.payloadSha256
    );
  }

  private pushTransaction(deviceId: string, operations: HashedPushOperation[]): SyncPushResponse {
    const accepted: SyncAcceptedOperation[] = [];
    for (const { operation, payloadJson, payloadSha256 } of operations) {
      const existing = this.ctx.storage.sql
        .exec<ExistingOperationRow>(
          "SELECT device_id, client_sequence, base_server_sequence, server_sequence, " +
            "payload_json FROM sync_operations WHERE operation_id = ?",
          operation.operationId,
        )
        .toArray()[0];
      if (existing !== undefined) {
        if (
          existing.device_id !== deviceId ||
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

      const indexed = this.indexedOperation(deviceId, operation);
      if (indexed !== undefined) {
        if (
          indexed.operation_id !== operation.operationId ||
          indexed.device_id !== deviceId ||
          indexed.client_sequence !== operation.clientSequence ||
          indexed.base_server_sequence !== operation.baseServerSequence ||
          indexed.payload_sha256 !== payloadSha256
        ) {
          throw new SyncContractError(
            `operation id ${operation.operationId} was reused with different content`,
          );
        }
        accepted.push({
          operationId: operation.operationId,
          clientSequence: operation.clientSequence,
          serverSequence: indexed.server_sequence,
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
          deviceId,
        )
        .one().sequence;
      if (operation.clientSequence !== currentDeviceSequence + 1) {
        throw new SyncContractError(
          `expected client sequence ${currentDeviceSequence + 1}, received ${operation.clientSequence}`,
        );
      }

      const referencedDigests = new Set(
        referencedManifests(operation.payload).flatMap((manifest) =>
          manifest.chunks.map((chunk) => chunk.digest),
        ),
      );
      const deleting = this.digestsMarkedForDeletion(referencedDigests);
      if (deleting.length > 0) {
        throw new SyncContractError(
          `chunked content is being removed: ${deleting.join(",")}`,
          "content_unavailable",
        );
      }

      const serverSequence = this.ctx.storage.sql
        .exec<{ server_sequence: number }>(
          "INSERT INTO sync_operations(" +
            "operation_id, device_id, client_sequence, base_server_sequence, payload_json" +
            ") VALUES (?, ?, ?, ?, ?) RETURNING server_sequence",
          operation.operationId,
          deviceId,
          operation.clientSequence,
          operation.baseServerSequence,
          payloadJson,
        )
        .one().server_sequence;
      this.ctx.storage.sql.exec(
        "INSERT INTO sync_operation_index(" +
          "device_id, client_sequence, operation_id, server_sequence, base_server_sequence, payload_sha256" +
          ") VALUES (?, ?, ?, ?, ?, ?)",
        deviceId,
        operation.clientSequence,
        operation.operationId,
        serverSequence,
        operation.baseServerSequence,
        payloadSha256,
      );
      this.ctx.storage.sql.exec(
        "INSERT INTO sync_device_heads(device_id, last_client_sequence) VALUES (?, ?) " +
          "ON CONFLICT(device_id) DO UPDATE SET last_client_sequence = excluded.last_client_sequence",
        deviceId,
        operation.clientSequence,
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

function readAttachment(socket: WebSocket): EventsSocketAttachment | null {
  try {
    return socket.deserializeAttachment() as EventsSocketAttachment;
  } catch {
    return null;
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

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
