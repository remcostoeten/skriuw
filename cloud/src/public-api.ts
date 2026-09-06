import {
  type AuthorizedWorkspaceAccess,
  type SyncAccessConfiguration,
  type SyncAccessFailureCode,
  SYNC_EVENTS_SUBPROTOCOL,
  authorizeWorkspaceRequest,
  membershipAllowsDevice,
  offersSyncEventsSubprotocol,
  requestWithSubprotocolCredential,
} from "./access";
import { readBoundedBytes } from "./bounded-body";
import { requireIdentifier } from "./contracts";
import { type WorkspaceContentStore, isContentDigest } from "./content-store";
import {
  type AcknowledgementResult,
  CANONICAL_CHUNK_BYTES,
  MAX_SYNC_BATCH_BYTES,
  MAX_SYNC_PULL_OPERATIONS,
  SUPPORTED_SYNC_PROTOCOL_VERSIONS,
  SyncContractError,
  type CompactionResult,
  type SyncErrorCode,
  type SyncPullResult,
  type SyncPushResult,
  type WorkspaceStorageUsage,
  type WorkspaceSyncState,
  parseSyncPullResponse,
  parseSyncPushRequest,
  requireSafeSequence,
} from "./contracts";

const MAX_DEVICE_IDLE_SECONDS = 60 * 60 * 24 * 30;

type WorkspaceSyncRpc = {
  fetch(request: Request): Promise<Response>;
  pushOperations(input: unknown): Promise<SyncPushResult>;
  pullOperations(afterServerSequence: number, requestedLimit?: number): Promise<SyncPullResult>;
  workspaceState(): Promise<WorkspaceSyncState>;
  storageUsage(): Promise<WorkspaceStorageUsage>;
  recordChunkUpload(digest: string, byteLength: number): Promise<WorkspaceStorageUsage>;
  publishCheckpoint(
    input: unknown,
  ): Promise<
    { ok: true; serverSequence: number } | { ok: false; code: string; message: string }
  >;
  latestCheckpoint(): Promise<string | null>;
  acknowledgeOperations(
    deviceId: string,
    serverSequence: number,
    nowEpochSeconds: number,
  ): Promise<AcknowledgementResult>;
  compact(
    nowEpochSeconds: number,
    maxDeviceIdleSeconds: number,
  ): Promise<CompactionResult>;
};

export type SyncRouteName =
  | "push"
  | "pull"
  | "chunk"
  | "checkpoint"
  | "acknowledge"
  | "events";

export const SYNC_EVENTS_DEVICE_HEADER = "x-skriuw-device-id";
export const SYNC_EVENTS_EXPIRY_HEADER = "x-skriuw-session-expires-at";

/**
 * Every field is a stable, server-chosen code. Workspace ids, device ids,
 * operation ids, digests, and message text never enter the log.
 */
export type SyncSecurityLogEvent = {
  event: "sync_request_rejected" | "sync_request_failed";
  code: string;
  status: number;
  route: SyncRouteName;
  method: string;
  reason?: string;
};

export type PublicSyncDependencies = {
  accessConfiguration: SyncAccessConfiguration;
  resolveWorkspace(workspaceId: string): WorkspaceSyncRpc;
  contentStore: WorkspaceContentStore;
  log(event: SyncSecurityLogEvent): void;
  nowEpochSeconds(): number;
};

type SyncRoute = {
  name: SyncRouteName;
  action: "push" | "pull";
  workspaceId: string;
  digest?: string;
};

type PublicErrorCode =
  | SyncAccessFailureCode
  | SyncErrorCode
  | "invalid_request"
  | "request_too_large"
  | "method_not_allowed"
  | "sync_service_unavailable"
  | "chunk_digest_mismatch"
  | "chunk_too_large"
  | "chunk_empty"
  | "chunk_not_found"
  | "checkpoint_not_found"
  | "log_truncated"
  | "quota_exceeded"
  | "upgrade_required"
  | "internal_error";

class PublicApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: PublicErrorCode,
    readonly reason?: string,
  ) {
    super(code);
  }
}

export async function handlePublicSyncRequest(
  request: Request,
  dependencies: PublicSyncDependencies,
): Promise<Response> {
  const route = matchSyncRoute(new URL(request.url).pathname, request.method);
  if (route === null) {
    return jsonError(404, "not_found");
  }

  try {
    const authenticatedRequest =
      route.name === "events" ? requestWithSubprotocolCredential(request) : request;
    const access = await authorizeWorkspaceRequest(
      authenticatedRequest,
      route.workspaceId,
      route.action,
      dependencies.accessConfiguration,
      dependencies.nowEpochSeconds(),
    );
    if (!access.ok) {
      throw accessError(access.code);
    }
    requireMethod(request.method, route);

    if (route.name === "events") {
      return await handleEventsRequest(request, route, access.access, dependencies);
    }

    if (route.name === "chunk") {
      return await handleChunkRequest(request, route, dependencies);
    }

    if (route.name === "checkpoint") {
      if (request.method === "GET") {
        const stored = await dependencies
          .resolveWorkspace(route.workspaceId)
          .latestCheckpoint();
        if (stored === null) {
          throw new PublicApiError(404, "checkpoint_not_found");
        }
        return jsonResponse(JSON.parse(stored));
      }
      const body = await readBoundedJson(request);
      const workspace = dependencies.resolveWorkspace(route.workspaceId);
      const published = await workspace.publishCheckpoint(body);
      if (!published.ok) {
        throw publishError(published.code);
      }
      const compaction = await workspace.compact(
        dependencies.nowEpochSeconds(),
        MAX_DEVICE_IDLE_SECONDS,
      );
      return jsonResponse({ serverSequence: published.serverSequence, compaction });
    }

    if (route.name === "acknowledge") {
      const body = await readBoundedJson(request);
      const { deviceId, serverSequence } = parseAcknowledgement(body);
      if (!membershipAllowsDevice(access.access.membership, deviceId)) {
        throw new PublicApiError(403, "device_not_authorized");
      }
      const acknowledged = await dependencies
        .resolveWorkspace(route.workspaceId)
        .acknowledgeOperations(deviceId, serverSequence, dependencies.nowEpochSeconds());
      if (!acknowledged.ok) {
        throw new PublicApiError(400, "sync_rejected", acknowledged.code);
      }
      return jsonResponse({
        deviceId,
        acknowledgedServerSequence: acknowledged.acknowledgedServerSequence,
      });
    }

    if (route.name === "push") {
      const input = await readBoundedJson(request);
      const pushRequest = parseSyncPushRequest(input);
      if (!membershipAllowsDevice(access.access.membership, pushRequest.deviceId)) {
        throw new PublicApiError(403, "device_not_authorized");
      }
      const result = await dependencies
        .resolveWorkspace(route.workspaceId)
        .pushOperations(pushRequest);
      if (!result.ok) {
        throw contractError(result.error.code);
      }
      return jsonResponse(result.response);
    }

    const { cursor, limit } = parsePullQuery(new URL(request.url));
    const pulled = await dependencies
      .resolveWorkspace(route.workspaceId)
      .pullOperations(cursor, limit);
    if (!pulled.ok) {
      throw new PublicApiError(410, "log_truncated");
    }
    const page: unknown = JSON.parse(pulled.responseJson);
    return jsonResponse(parseSyncPullResponse(page));
  } catch (error) {
    const publicError = normalizePublicError(error);
    dependencies.log({
      event:
        publicError.status >= 500
          ? "sync_request_failed"
          : "sync_request_rejected",
      code: publicError.code,
      status: publicError.status,
      route: route.name,
      method: request.method,
      ...(publicError.reason === undefined ? {} : { reason: publicError.reason }),
    });
    return jsonError(publicError.status, publicError.code, authHeaders(publicError.code));
  }
}

export function logSyncSecurityEvent(event: SyncSecurityLogEvent): void {
  const serialized = JSON.stringify(event);
  if (event.status >= 500) {
    console.error(serialized);
  } else {
    console.warn(serialized);
  }
}

function matchSyncRoute(pathname: string, method: string): SyncRoute | null {
  const parts = pathname.split("/");
  if (parts[0] !== "" || parts[1] !== "v1" || parts[2] !== "workspaces") {
    return null;
  }
  const workspaceId = parts[3];
  if (workspaceId === undefined || workspaceId === "") {
    return null;
  }

  if (parts.length === 6 && parts[4] === "chunks") {
    const digest = parts[5];
    if (digest === undefined || !isContentDigest(digest)) {
      return null;
    }
    return {
      name: "chunk",
      action: method === "PUT" ? "push" : "pull",
      workspaceId,
      digest,
    };
  }
  if (parts.length !== 5) {
    return null;
  }
  switch (parts[4]) {
    case "push":
      return { name: "push", action: "push", workspaceId };
    case "pull":
      return { name: "pull", action: "pull", workspaceId };
    case "checkpoint":
      return {
        name: "checkpoint",
        action: method === "POST" ? "push" : "pull",
        workspaceId,
      };
    case "acknowledge":
      return { name: "acknowledge", action: "pull", workspaceId };
    case "events":
      return { name: "events", action: "pull", workspaceId };
    default:
      return null;
  }
}

function requireMethod(method: string, route: SyncRoute): void {
  const allowed: Record<SyncRouteName, readonly string[]> = {
    push: ["POST"],
    pull: ["GET"],
    chunk: ["PUT", "GET", "HEAD"],
    checkpoint: ["GET", "POST"],
    acknowledge: ["POST"],
    events: ["GET"],
  };
  if (!allowed[route.name].includes(method)) {
    throw new PublicApiError(405, "method_not_allowed");
  }
}

/**
 * The upgrade is forwarded to the workspace Durable Object only after the
 * Worker has fully authorized it; the object trusts the device and expiry
 * headers because clients can never reach it directly. The bearer credential
 * is stripped so it does not outlive the handshake.
 */
async function handleEventsRequest(
  request: Request,
  route: SyncRoute,
  access: AuthorizedWorkspaceAccess,
  dependencies: PublicSyncDependencies,
): Promise<Response> {
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    throw new PublicApiError(426, "upgrade_required");
  }
  const deviceId = parseEventsQuery(new URL(request.url));
  if (!membershipAllowsDevice(access.membership, deviceId)) {
    throw new PublicApiError(403, "device_not_authorized");
  }
  const headers = new Headers({ Upgrade: "websocket" });
  headers.set(SYNC_EVENTS_DEVICE_HEADER, deviceId);
  headers.set(
    SYNC_EVENTS_EXPIRY_HEADER,
    String(access.identity.expiresAtEpochSeconds),
  );
  if (offersSyncEventsSubprotocol(request.headers)) {
    headers.set("Sec-WebSocket-Protocol", SYNC_EVENTS_SUBPROTOCOL);
  }
  return dependencies
    .resolveWorkspace(route.workspaceId)
    .fetch(new Request(request.url, { headers }));
}

function parseEventsQuery(url: URL): string {
  if ([...url.searchParams.keys()].some((key) => key !== "deviceId")) {
    throw new PublicApiError(400, "invalid_request");
  }
  const values = url.searchParams.getAll("deviceId");
  if (values.length !== 1) {
    throw new PublicApiError(400, "invalid_request");
  }
  try {
    return requireIdentifier(values[0], "deviceId");
  } catch (error) {
    throw normalizeContractError(error);
  }
}

async function handleChunkRequest(
  request: Request,
  route: SyncRoute,
  dependencies: PublicSyncDependencies,
): Promise<Response> {
  const digest = route.digest!;
  if (request.method === "HEAD") {
    const stored = await dependencies.contentStore.hasChunk(route.workspaceId, digest);
    return new Response(null, {
      status: stored ? 204 : 404,
      headers: { "Cache-Control": "no-store" },
    });
  }
  if (request.method === "GET") {
    const chunk = await dependencies.contentStore.getChunk(route.workspaceId, digest);
    if (!chunk.ok) {
      throw new PublicApiError(chunk.code === "chunk_not_found" ? 404 : 500, chunk.code);
    }
    return new Response(chunk.bytes, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "no-store",
      },
    });
  }

  const bytes = await readBody(request, CANONICAL_CHUNK_BYTES);
  const workspace = dependencies.resolveWorkspace(route.workspaceId);
  const usage = await workspace.storageUsage();
  if (usage.byteLength + bytes.byteLength > usage.quotaBytes) {
    throw new PublicApiError(413, "quota_exceeded");
  }
  const stored = await dependencies.contentStore.putChunk(
    route.workspaceId,
    digest,
    bytes,
  );
  if (!stored.ok) {
    throw new PublicApiError(stored.code === "chunk_too_large" ? 413 : 400, stored.code);
  }
  await workspace.recordChunkUpload(digest, bytes.byteLength);
  return jsonResponse({ digest, created: stored.created });
}

async function readBody(request: Request, maximumBytes: number): Promise<Uint8Array> {
  const body = await readBoundedBytes(request, maximumBytes);
  if (!body.ok) {
    throw new PublicApiError(body.code === "request_too_large" ? 413 : 400, body.code);
  }
  return body.bytes;
}

function parseAcknowledgement(input: unknown): {
  deviceId: string;
  serverSequence: number;
} {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new PublicApiError(400, "invalid_request");
  }
  const record = input as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== "deviceId" && key !== "serverSequence")) {
    throw new PublicApiError(400, "invalid_request");
  }
  try {
    return {
      deviceId: requireIdentifier(record.deviceId, "deviceId"),
      serverSequence: requireSafeSequence(record.serverSequence, "serverSequence", true),
    };
  } catch (error) {
    throw normalizeContractError(error);
  }
}

function publishError(code: string): PublicApiError {
  if (code === "content_unavailable") {
    return new PublicApiError(409, "content_unavailable");
  }
  return new PublicApiError(400, "sync_rejected");
}

async function readBoundedJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("Content-Type");
  if (contentType?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
    throw new PublicApiError(400, "invalid_request");
  }
  const body = await readBody(request, MAX_SYNC_BATCH_BYTES);
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(body),
    );
  } catch {
    throw new PublicApiError(400, "invalid_request");
  }
}

function parsePullQuery(url: URL): { cursor: number; limit: number } {
  const allowedKeys = new Set([
    "syncProtocolVersion",
    "afterServerSequence",
    "limit",
  ]);
  if ([...url.searchParams.keys()].some((key) => !allowedKeys.has(key))) {
    throw new PublicApiError(400, "invalid_request");
  }
  if (url.searchParams.getAll("syncProtocolVersion").length !== 1) {
    throw new PublicApiError(400, "invalid_request");
  }
  const requestedVersion = url.searchParams.get("syncProtocolVersion") ?? "";
  if (!SUPPORTED_SYNC_PROTOCOL_VERSIONS.includes(Number(requestedVersion))) {
    throw new PublicApiError(400, "sync_rejected");
  }
  const cursor = parseSequenceParameter(
    url.searchParams.getAll("afterServerSequence"),
    "afterServerSequence",
    true,
  );
  const limitValues = url.searchParams.getAll("limit");
  const limit =
    limitValues.length === 0
      ? 128
      : parseSequenceParameter(limitValues, "limit", false);
  if (limit > MAX_SYNC_PULL_OPERATIONS) {
    throw new PublicApiError(400, "sync_rejected");
  }
  return { cursor, limit };
}

function parseSequenceParameter(
  values: string[],
  field: string,
  allowZero: boolean,
): number {
  if (values.length !== 1 || !/^(0|[1-9]\d*)$/.test(values[0] ?? "")) {
    throw new PublicApiError(400, "invalid_request");
  }
  try {
    return requireSafeSequence(Number(values[0]), field, allowZero);
  } catch (error) {
    throw normalizeContractError(error);
  }
}

function accessError(code: SyncAccessFailureCode): PublicApiError {
  switch (code) {
    case "sync_authentication_not_configured":
    case "sync_authorization_not_configured":
    case "sync_security_configuration_invalid":
    case "sync_authentication_unavailable":
    case "sync_authorization_unavailable":
      return new PublicApiError(503, code);
    case "credential_missing":
    case "credential_malformed":
    case "credential_invalid":
    case "credential_expired":
    case "credential_revoked":
      return new PublicApiError(401, code);
    case "workspace_access_denied":
      return new PublicApiError(404, code);
    case "workspace_permission_denied":
    case "device_not_authorized":
      return new PublicApiError(403, code);
    case "invalid_workspace_identifier":
      return new PublicApiError(400, code);
  }
}

function contractError(code: SyncErrorCode): PublicApiError {
  return new PublicApiError(400, code);
}

function normalizeContractError(error: unknown): PublicApiError {
  if (error instanceof SyncContractError) {
    return contractError(error.code);
  }
  return new PublicApiError(500, "internal_error");
}

function normalizePublicError(error: unknown): PublicApiError {
  if (error instanceof PublicApiError) {
    return error;
  }
  if (error instanceof SyncContractError) {
    return contractError(error.code);
  }
  if (error instanceof SyntaxError) {
    return new PublicApiError(503, "sync_service_unavailable");
  }
  return new PublicApiError(500, "internal_error");
}

function authHeaders(code: PublicErrorCode): HeadersInit | undefined {
  return code.startsWith("credential_")
    ? { "WWW-Authenticate": 'Bearer realm="skriuw-sync"' }
    : undefined;
}

function jsonResponse(value: unknown): Response {
  return Response.json(value, {
    headers: { "Cache-Control": "no-store" },
  });
}

function jsonError(
  status: number,
  code: string,
  headers?: HeadersInit,
): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Cache-Control", "no-store");
  return Response.json({ error: code }, { status, headers: responseHeaders });
}
