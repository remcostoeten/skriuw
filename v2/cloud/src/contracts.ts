import { type Schema, Validator } from "@cfworker/json-schema";

import operationSyncPolicy from "../../contracts/generated/workspace-operation-sync-policy-v1.json";
import workspaceOperationSchema from "../../contracts/generated/workspace-operation.schema.json";

export const WORKSPACE_SYNC_PROTOCOL_VERSION = 1;
export const MAX_SYNC_BATCH_OPERATIONS = 64;
export const MAX_SYNC_PULL_OPERATIONS = 256;
export const MAX_INLINE_SYNC_OPERATION_BYTES = 1_500_000;
export const MAX_SYNC_BATCH_BYTES = 8 * 1024 * 1024;
export const MAX_SAFE_SYNC_SEQUENCE = Number.MAX_SAFE_INTEGER;

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type WorkspaceOperationEnvelopeJson = {
  protocolVersion: number;
  operation: { [key: string]: JsonValue };
};

export type ClientSyncOperation = {
  operationId: string;
  clientSequence: number;
  baseServerSequence: number;
  operation: WorkspaceOperationEnvelopeJson;
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
  | "unsupported_operation";

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
  if (syncProtocolVersion !== WORKSPACE_SYNC_PROTOCOL_VERSION) {
    throw new SyncContractError(`unsupported sync protocol ${syncProtocolVersion}`);
  }
  const deviceId = requireIdentifier(request.deviceId, "deviceId");
  if (!Array.isArray(request.operations) || request.operations.length === 0) {
    throw new SyncContractError("operations must be a non-empty array");
  }
  if (request.operations.length > MAX_SYNC_BATCH_OPERATIONS) {
    throw new SyncContractError("sync operation batch is too large");
  }

  const operations = request.operations.map(parseClientSyncOperation);
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

  const parsed = { syncProtocolVersion, deviceId, operations };
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
  if (syncProtocolVersion !== WORKSPACE_SYNC_PROTOCOL_VERSION) {
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
    const operation = parseClientSyncOperation({
      operationId: record.operationId,
      clientSequence: record.clientSequence,
      baseServerSequence: record.baseServerSequence,
      operation: record.operation,
    });
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
    syncProtocolVersion,
    operations,
    latestServerSequence,
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

function parseClientSyncOperation(input: unknown): ClientSyncOperation {
  const operation = requireRecord(input, "sync operation");
  requireExactKeys(
    operation,
    ["operationId", "clientSequence", "baseServerSequence", "operation"],
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
  const workspaceEnvelope = parseWorkspaceOperationEnvelope(operation.operation);

  const parsed: ClientSyncOperation = {
    operationId,
    clientSequence,
    baseServerSequence,
    operation: workspaceEnvelope,
  };
  if (jsonByteLength(parsed) > MAX_INLINE_SYNC_OPERATION_BYTES) {
    throw new SyncContractError("sync operation requires chunked content transport");
  }
  return parsed;
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
