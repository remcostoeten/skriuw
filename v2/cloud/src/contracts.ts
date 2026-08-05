import { type Schema, Validator } from "@cfworker/json-schema";

import operationSyncPolicy from "../../contracts/generated/workspace-operation-sync-policy-v1.json";
import workspaceOperationSchema from "../../contracts/generated/workspace-operation.schema.json";

export const WORKSPACE_SYNC_PROTOCOL_VERSION = 2;
export const SUPPORTED_SYNC_PROTOCOL_VERSIONS: readonly number[] = [1, 2];
export const MIN_CHUNKED_CONTENT_PROTOCOL_VERSION = 2;
export const CONTENT_MANIFEST_VERSION = 1;
export const CONTENT_DIGEST_HEX_BYTES = 64;
export const CANONICAL_CHUNK_BYTES = 1024 * 1024;
export const MAX_MANIFEST_CHUNKS = 256;
export const MAX_CONTENT_BYTES = CANONICAL_CHUNK_BYTES * MAX_MANIFEST_CHUNKS;
export const WORKSPACE_CHECKPOINT_VERSION = 1;
export const CHECKPOINT_CONTENT_MIME_TYPE = "application/json";
export const SUPPORTED_ARCHIVE_VERSIONS: readonly number[] = [1, 2, 3];
export const MAX_RETAINED_CHECKPOINTS = 2;
export const MAX_SYNC_BATCH_OPERATIONS = 64;
export const MAX_SYNC_PULL_OPERATIONS = 256;
export const MAX_INLINE_SYNC_OPERATION_BYTES = 1_500_000;
export const MAX_SYNC_BATCH_BYTES = 8 * 1024 * 1024;
export const MAX_SAFE_SYNC_SEQUENCE = Number.MAX_SAFE_INTEGER;
export const MAX_OPERATION_ASSET_MANIFESTS = 4;

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type WorkspaceOperationEnvelopeJson = {
  protocolVersion: number;
  operation: { [key: string]: JsonValue };
};

export type ContentChunkRef = {
  digest: string;
  byteLength: number;
};

export type ContentManifest = {
  manifestVersion: number;
  kind: "operation_envelope" | "asset" | "checkpoint";
  algorithm: "sha256";
  encoding: "identity";
  contentDigest: string;
  mimeType: string;
  totalByteLength: number;
  chunks: ContentChunkRef[];
};

export type SyncOperationPayload =
  | { form: "inline"; operation: WorkspaceOperationEnvelopeJson; assets?: ContentManifest[] }
  | { form: "chunked"; manifest: ContentManifest };

export type ClientSyncOperation = {
  operationId: string;
  clientSequence: number;
  baseServerSequence: number;
  payload: SyncOperationPayload;
};

export type SyncPushRequest = {
  syncProtocolVersion: number;
  deviceId: string;
  operations: ClientSyncOperation[];
};

export type SyncAcceptedOperation = {
  operationId: string;
  clientSequence: number;
  serverSequence: number;
};

export type SyncPushResponse = {
  syncProtocolVersion: number;
  accepted: SyncAcceptedOperation[];
  latestServerSequence: number;
};

export type SyncPushResult =
  | { ok: true; response: SyncPushResponse }
  | { ok: false; error: { code: SyncErrorCode; message: string } };

export type SyncErrorCode =
  | "sync_rejected"
  | "device_local_operation"
  | "unsupported_operation"
  | "content_unavailable";

export type WorkspaceCheckpointRecord = {
  checkpointVersion: number;
  syncProtocolVersion: number;
  archiveVersion: number;
  workspaceId: string;
  serverSequence: number;
  createdAt: number;
  content: ContentManifest;
};

export type AcknowledgementResult =
  | { ok: true; acknowledgedServerSequence: number }
  | { ok: false; code: "sequence_ahead_of_workspace" };

export type CompactionResult = {
  expiredDevices: number;
  removedOperations: number;
  removedCheckpoints: number;
  removedChunks: number;
};

export type ReplicatedWorkspaceOperation = ClientSyncOperation & {
  deviceId: string;
  serverSequence: number;
};

export type SyncPullResponse = {
  syncProtocolVersion: number;
  operations: ReplicatedWorkspaceOperation[];
  latestServerSequence: number;
};

export class SyncContractError extends Error {
  constructor(
    message: string,
    readonly code: SyncErrorCode = "sync_rejected",
  ) {
    super(message);
  }
}

type ReplicationClass =
  | "replicated_workspace_content"
  | "device_local"
  | "unsupported_sync_protocol_v1";

const workspaceOperationPolicy = new Map<string, ReplicationClass>(
  operationSyncPolicy.map(
    ({ operationType, replicationClass }): [string, ReplicationClass] => [
      operationType,
      parseReplicationClass(replicationClass),
    ],
  ),
);

const operationSchemaValidator = new Validator(
  workspaceOperationSchema as Schema,
  "2020-12",
);

export const WORKSPACE_OPERATION_SYNC_POLICY_V1 = operationSyncPolicy;

function parseReplicationClass(value: string): ReplicationClass {
  switch (value) {
    case "replicated_workspace_content":
    case "device_local":
    case "unsupported_sync_protocol_v1":
      return value;
    default:
      throw new Error(`unknown generated replication class ${value}`);
  }
}

export function parseSyncPushRequest(input: unknown): SyncPushRequest {
  const request = requireRecord(input, "sync request");
  requireExactKeys(
    request,
    ["syncProtocolVersion", "deviceId", "operations"],
    "sync request",
  );
  const syncProtocolVersion = requireNumber(
    request.syncProtocolVersion,
    "syncProtocolVersion",
  );
  if (!SUPPORTED_SYNC_PROTOCOL_VERSIONS.includes(syncProtocolVersion)) {
    throw new SyncContractError(`unsupported sync protocol ${syncProtocolVersion}`);
  }
  const deviceId = requireIdentifier(request.deviceId, "deviceId");
  if (!Array.isArray(request.operations) || request.operations.length === 0) {
    throw new SyncContractError("operations must be a non-empty array");
  }
  if (request.operations.length > MAX_SYNC_BATCH_OPERATIONS) {
    throw new SyncContractError("sync operation batch is too large");
  }

  const operations = request.operations.map((operation) =>
    parseClientSyncOperation(operation, syncProtocolVersion),
  );
  const operationIds = new Set<string>();
  const clientSequences = new Set<number>();
  let previousSequence: number | undefined;
  for (const operation of operations) {
    if (operationIds.has(operation.operationId)) {
      throw new SyncContractError(`duplicate operation id ${operation.operationId}`);
    }
    if (clientSequences.has(operation.clientSequence)) {
      throw new SyncContractError(`duplicate client sequence ${operation.clientSequence}`);
    }
    if (
      previousSequence !== undefined &&
      operation.clientSequence !== previousSequence + 1
    ) {
      throw new SyncContractError("client sequences must be contiguous");
    }
    operationIds.add(operation.operationId);
    clientSequences.add(operation.clientSequence);
    previousSequence = operation.clientSequence;
  }

  const parsed = {
    syncProtocolVersion: WORKSPACE_SYNC_PROTOCOL_VERSION,
    deviceId,
    operations,
  };
  if (jsonByteLength(parsed) > MAX_SYNC_BATCH_BYTES) {
    throw new SyncContractError("sync operation batch exceeds its byte limit");
  }
  return parsed;
}

export function parseSyncPullResponse(input: unknown): SyncPullResponse {
  const response = requireRecord(input, "sync pull response");
  const syncProtocolVersion = requireNumber(
    response.syncProtocolVersion,
    "syncProtocolVersion",
  );
  if (!SUPPORTED_SYNC_PROTOCOL_VERSIONS.includes(syncProtocolVersion)) {
    throw new SyncContractError(`unsupported sync protocol ${syncProtocolVersion}`);
  }
  const latestServerSequence = requireSafeSequence(
    response.latestServerSequence,
    "latestServerSequence",
    true,
  );
  if (!Array.isArray(response.operations)) {
    throw new SyncContractError("operations must be an array");
  }
  if (response.operations.length > MAX_SYNC_PULL_OPERATIONS) {
    throw new SyncContractError("sync pull response is too large");
  }
  let previousServerSequence = 0;
  const operations = response.operations.map((inputOperation) => {
    const record = requireRecord(inputOperation, "replicated operation");
    const operation = parseClientSyncOperation(
      syncProtocolVersion >= MIN_CHUNKED_CONTENT_PROTOCOL_VERSION
        ? {
            operationId: record.operationId,
            clientSequence: record.clientSequence,
            baseServerSequence: record.baseServerSequence,
            payload: record.payload,
          }
        : {
            operationId: record.operationId,
            clientSequence: record.clientSequence,
            baseServerSequence: record.baseServerSequence,
            operation: record.operation,
          },
      syncProtocolVersion,
    );
    const deviceId = requireIdentifier(record.deviceId, "deviceId");
    const serverSequence = requireSafeSequence(
      record.serverSequence,
      "serverSequence",
      false,
    );
    if (
      serverSequence <= previousServerSequence ||
      serverSequence > latestServerSequence
    ) {
      throw new SyncContractError("server sequences must be ordered and bounded");
    }
    previousServerSequence = serverSequence;
    return { ...operation, deviceId, serverSequence };
  });
  return {
    syncProtocolVersion: WORKSPACE_SYNC_PROTOCOL_VERSION,
    operations,
    latestServerSequence,
  };
}

export function parseWorkspaceCheckpoint(input: unknown): WorkspaceCheckpointRecord {
  const checkpoint = requireRecord(input, "workspace checkpoint");
  requireExactKeys(
    checkpoint,
    [
      "checkpointVersion",
      "syncProtocolVersion",
      "archiveVersion",
      "workspaceId",
      "serverSequence",
      "createdAt",
      "content",
    ],
    "workspace checkpoint",
  );
  const checkpointVersion = requireNumber(checkpoint.checkpointVersion, "checkpointVersion");
  if (checkpointVersion !== WORKSPACE_CHECKPOINT_VERSION) {
    throw new SyncContractError(`unsupported checkpoint version ${checkpointVersion}`);
  }
  const syncProtocolVersion = requireNumber(
    checkpoint.syncProtocolVersion,
    "syncProtocolVersion",
  );
  if (!SUPPORTED_SYNC_PROTOCOL_VERSIONS.includes(syncProtocolVersion)) {
    throw new SyncContractError(`unsupported sync protocol ${syncProtocolVersion}`);
  }
  const archiveVersion = requireNumber(checkpoint.archiveVersion, "archiveVersion");
  if (!SUPPORTED_ARCHIVE_VERSIONS.includes(archiveVersion)) {
    throw new SyncContractError(`unsupported archive version ${archiveVersion}`);
  }
  const workspaceId = requireIdentifier(checkpoint.workspaceId, "workspaceId");
  const serverSequence = requireSafeSequence(checkpoint.serverSequence, "serverSequence", true);
  const createdAt = requireSafeSequence(checkpoint.createdAt, "createdAt", true);
  const content = parseContentManifest(checkpoint.content);
  if (content.kind !== "checkpoint") {
    throw new SyncContractError("checkpoint content must be a checkpoint manifest");
  }
  if (content.mimeType !== CHECKPOINT_CONTENT_MIME_TYPE) {
    throw new SyncContractError("checkpoint content must be application/json");
  }
  return {
    checkpointVersion,
    syncProtocolVersion,
    archiveVersion,
    workspaceId,
    serverSequence,
    createdAt,
    content,
  };
}

export function parseStoredJson(value: string): JsonValue {
  const parsed: unknown = JSON.parse(value);
  if (!isJsonValue(parsed)) {
    throw new SyncContractError("stored operation is not valid JSON data");
  }
  return parsed;
}

export function requireSafeSequence(value: unknown, field: string, allowZero: boolean): number {
  const sequence = requireNumber(value, field);
  const minimum = allowZero ? 0 : 1;
  if (!Number.isSafeInteger(sequence) || sequence < minimum) {
    throw new SyncContractError(`${field} is outside its supported range`);
  }
  return sequence;
}

function parseClientSyncOperation(
  input: unknown,
  protocolVersion: number,
): ClientSyncOperation {
  const operation = requireRecord(input, "sync operation");
  const chunkedCapable = protocolVersion >= MIN_CHUNKED_CONTENT_PROTOCOL_VERSION;
  requireExactKeys(
    operation,
    [
      "operationId",
      "clientSequence",
      "baseServerSequence",
      chunkedCapable ? "payload" : "operation",
    ],
    "sync operation",
  );
  const operationId = requireIdentifier(operation.operationId, "operationId");
  const clientSequence = requireSafeSequence(
    operation.clientSequence,
    "clientSequence",
    false,
  );
  const baseServerSequence = requireSafeSequence(
    operation.baseServerSequence,
    "baseServerSequence",
    true,
  );
  const payload: SyncOperationPayload = chunkedCapable
    ? parseSyncOperationPayload(operation.payload)
    : parseBareInlinePayload(operation.operation);

  const parsed: ClientSyncOperation = {
    operationId,
    clientSequence,
    baseServerSequence,
    payload,
  };
  if (
    payload.form === "inline" &&
    jsonByteLength(parsed) > MAX_INLINE_SYNC_OPERATION_BYTES
  ) {
    throw new SyncContractError("sync operation requires chunked content transport");
  }
  return parsed;
}

export function parseSyncOperationPayload(input: unknown): SyncOperationPayload {
  const payload = requireRecord(input, "sync operation payload");
  if (payload.form === "inline") {
    requireExactKeys(payload, ["form", "operation", "assets"], "sync operation payload");
    const operation = parseWorkspaceOperationEnvelope(payload.operation);
    const assets = parseOperationAssets(payload.assets, operation);
    if (assets === undefined) {
      return { form: "inline", operation };
    }
    return { form: "inline", operation, assets };
  }
  if (payload.form === "chunked") {
    requireExactKeys(payload, ["form", "manifest"], "sync operation payload");
    const manifest = parseContentManifest(payload.manifest);
    if (manifest.kind !== "operation_envelope") {
      throw new SyncContractError(
        "chunked sync operations must carry an operation-envelope manifest",
      );
    }
    return { form: "chunked", manifest };
  }
  throw new SyncContractError("sync operation payload form is not supported");
}

function parseBareInlinePayload(input: unknown): SyncOperationPayload {
  const operation = parseWorkspaceOperationEnvelope(input);
  parseOperationAssets(undefined, operation);
  return { form: "inline", operation };
}

function parseOperationAssets(
  input: unknown,
  operation: WorkspaceOperationEnvelopeJson,
): ContentManifest[] | undefined {
  const operationType = operation.operation.type;
  const image =
    operationType === "attach_image"
      ? requireRecord(operation.operation.image, "attach_image image")
      : undefined;
  if (input === undefined) {
    if (image !== undefined) {
      throw new SyncContractError(
        "workspace operation attach_image requires its asset content manifest",
      );
    }
    return undefined;
  }
  if (image === undefined) {
    throw new SyncContractError(
      `workspace operation ${String(operationType)} cannot carry asset content`,
    );
  }
  if (!Array.isArray(input) || input.length === 0) {
    throw new SyncContractError("operation assets must be a non-empty array");
  }
  if (input.length > MAX_OPERATION_ASSET_MANIFESTS) {
    throw new SyncContractError("operation carries too many asset manifests");
  }
  const assets = input.map((manifest) => {
    const parsed = parseContentManifest(manifest);
    if (parsed.kind !== "asset") {
      throw new SyncContractError("operation assets must carry asset manifests");
    }
    return parsed;
  });
  const manifest = assets.length === 1 ? assets[0] : undefined;
  if (
    manifest === undefined ||
    manifest.contentDigest !== image.contentHash ||
    manifest.mimeType !== image.mimeType ||
    manifest.totalByteLength !== image.byteSize
  ) {
    throw new SyncContractError(
      "asset manifest does not match the content attach_image declares",
    );
  }
  return assets;
}

export function parseContentManifest(input: unknown): ContentManifest {
  const manifest = requireRecord(input, "content manifest");
  requireExactKeys(
    manifest,
    [
      "manifestVersion",
      "kind",
      "algorithm",
      "encoding",
      "contentDigest",
      "mimeType",
      "totalByteLength",
      "chunks",
    ],
    "content manifest",
  );
  const manifestVersion = requireNumber(manifest.manifestVersion, "manifestVersion");
  if (manifestVersion !== CONTENT_MANIFEST_VERSION) {
    throw new SyncContractError(`unsupported content manifest version ${manifestVersion}`);
  }
  if (
    manifest.kind !== "operation_envelope" &&
    manifest.kind !== "asset" &&
    manifest.kind !== "checkpoint"
  ) {
    throw new SyncContractError("content manifest kind is not supported");
  }
  if (manifest.algorithm !== "sha256") {
    throw new SyncContractError("content hash algorithm is not supported");
  }
  if (manifest.encoding !== "identity") {
    throw new SyncContractError("content encoding is not supported");
  }
  const contentDigest = requireContentDigest(manifest.contentDigest, "contentDigest");
  const mimeType = requireContentMimeType(manifest.mimeType);
  const totalByteLength = requireSafeSequence(
    manifest.totalByteLength,
    "totalByteLength",
    false,
  );
  if (totalByteLength > MAX_CONTENT_BYTES) {
    throw new SyncContractError("content exceeds its configured byte ceiling");
  }
  if (!Array.isArray(manifest.chunks) || manifest.chunks.length === 0) {
    throw new SyncContractError("content manifest must list at least one chunk");
  }
  if (manifest.chunks.length > MAX_MANIFEST_CHUNKS) {
    throw new SyncContractError("content manifest lists too many chunks");
  }

  const lastIndex = manifest.chunks.length - 1;
  let total = 0;
  const chunks = manifest.chunks.map((input, index): ContentChunkRef => {
    const chunk = requireRecord(input, "content chunk");
    requireExactKeys(chunk, ["digest", "byteLength"], "content chunk");
    const digest = requireContentDigest(chunk.digest, "chunk digest");
    const byteLength = requireSafeSequence(chunk.byteLength, "chunk byteLength", false);
    if (byteLength > CANONICAL_CHUNK_BYTES) {
      throw new SyncContractError("content chunk exceeds the canonical chunk size");
    }
    if (index < lastIndex && byteLength !== CANONICAL_CHUNK_BYTES) {
      throw new SyncContractError(
        "only the final content chunk may be shorter than the canonical chunk size",
      );
    }
    total += byteLength;
    return { digest, byteLength };
  });
  if (total !== totalByteLength) {
    throw new SyncContractError(
      "declared content length does not match the sum of chunk lengths",
    );
  }

  return {
    manifestVersion,
    kind: manifest.kind,
    algorithm: "sha256",
    encoding: "identity",
    contentDigest,
    mimeType,
    totalByteLength,
    chunks,
  };
}

function requireContentDigest(value: unknown, field: string): string {
  if (
    typeof value !== "string" ||
    value.length !== CONTENT_DIGEST_HEX_BYTES ||
    !/^[0-9a-f]+$/.test(value)
  ) {
    throw new SyncContractError(`${field} is not a lowercase sha-256 digest`);
  }
  return value;
}

function requireContentMimeType(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 128 ||
    !/^(application|image|text|audio|video)\/[A-Za-z0-9\-+.]+$/.test(value)
  ) {
    throw new SyncContractError("content mime type is not supported");
  }
  return value;
}

export function parseWorkspaceOperationEnvelope(
  input: unknown,
): WorkspaceOperationEnvelopeJson {
  const workspaceEnvelope = requireRecord(input, "operation envelope");
  requireExactKeys(
    workspaceEnvelope,
    ["protocolVersion", "operation"],
    "operation envelope",
  );
  const protocolVersion = requireNumber(
    workspaceEnvelope.protocolVersion,
    "operation.protocolVersion",
  );
  if (protocolVersion !== 1) {
    throw new SyncContractError(`unsupported workspace protocol ${protocolVersion}`);
  }
  const workspaceOperation = requireRecord(
    workspaceEnvelope.operation,
    "workspace operation",
  );
  if (typeof workspaceOperation.type !== "string") {
    throw new SyncContractError("workspace operation type is required");
  }
  if (!isJsonValue(workspaceOperation)) {
    throw new SyncContractError("workspace operation contains unsupported data");
  }
  requireReplicatedWorkspaceOperation(workspaceOperation.type);
  if (
    !operationSchemaValidator.validate(workspaceEnvelope).valid ||
    containsUnsafeInteger(workspaceEnvelope)
  ) {
    throw new SyncContractError("workspace operation fields are invalid");
  }
  return { protocolVersion, operation: workspaceOperation };
}

function requireReplicatedWorkspaceOperation(operationType: string): void {
  const replicationClass = workspaceOperationPolicy.get(operationType);
  if (replicationClass === undefined) {
    throw new SyncContractError(
      `unknown workspace operation type ${operationType}`,
    );
  }
  if (replicationClass === "device_local") {
    throw new SyncContractError(
      `workspace operation ${operationType} is device-local and cannot be replicated`,
      "device_local_operation",
    );
  }
  if (replicationClass === "unsupported_sync_protocol_v1") {
    throw new SyncContractError(
      `workspace operation ${operationType} requires a later sync protocol capability`,
      "unsupported_operation",
    );
  }
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isUnknownRecord(value)) {
    throw new SyncContractError(`${field} must be an object`);
  }
  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new SyncContractError(`${field} must be a finite number`);
  }
  return value;
}

export function requireIdentifier(value: unknown, field: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    throw new SyncContractError(`${field} is not a valid identifier`);
  }
  return value;
}

function requireExactKeys(
  record: Record<string, unknown>,
  allowedKeys: readonly string[],
  field: string,
): void {
  const allowed = new Set(allowedKeys);
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    throw new SyncContractError(`${field} contains unsupported fields`);
  }
}

function jsonByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function containsUnsafeInteger(value: unknown): boolean {
  if (typeof value === "number") {
    return Number.isInteger(value) && !Number.isSafeInteger(value);
  }
  if (Array.isArray(value)) {
    return value.some(containsUnsafeInteger);
  }
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return Object.values(value).some(containsUnsafeInteger);
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  if (typeof value !== "object") {
    return false;
  }
  return Object.values(value).every(isJsonValue);
}
