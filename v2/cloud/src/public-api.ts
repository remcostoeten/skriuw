import {
  type SyncAccessConfiguration,
  type SyncAccessFailureCode,
  authorizeWorkspaceRequest,
  membershipAllowsDevice,
} from "./access";
import {
  MAX_SYNC_BATCH_BYTES,
  MAX_SYNC_PULL_OPERATIONS,
  SyncContractError,
  type SyncErrorCode,
  type SyncPullResponse,
  type SyncPushResult,
  parseSyncPullResponse,
  parseSyncPushRequest,
  requireSafeSequence,
} from "./contracts";

type WorkspaceSyncRpc = {
  pushOperations(input: unknown): Promise<SyncPushResult>;
  pullOperations(afterServerSequence: number, requestedLimit?: number): Promise<string>;
};

export type SyncSecurityLogEvent = {
  event: "sync_request_rejected" | "sync_request_failed";
  code: string;
  status: number;
  route: "push" | "pull";
  method: string;
};

export type PublicSyncDependencies = {
  accessConfiguration: SyncAccessConfiguration;
  resolveWorkspace(workspaceId: string): WorkspaceSyncRpc;
  log(event: SyncSecurityLogEvent): void;
  nowEpochSeconds(): number;
};

type SyncRoute = {
  action: "push" | "pull";
  workspaceId: string;
};

type PublicErrorCode =
  | SyncAccessFailureCode
  | SyncErrorCode
  | "invalid_request"
  | "request_too_large"
  | "method_not_allowed"
  | "sync_service_unavailable"
  | "internal_error";

class PublicApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: PublicErrorCode,
  ) {
    super(code);
  }
}

export async function handlePublicSyncRequest(
  request: Request,
  dependencies: PublicSyncDependencies,
): Promise<Response> {
  const route = matchSyncRoute(new URL(request.url).pathname);
  if (route === null) {
    return jsonError(404, "not_found");
  }

  try {
    const access = await authorizeWorkspaceRequest(
      request,
      route.workspaceId,
      route.action,
      dependencies.accessConfiguration,
      dependencies.nowEpochSeconds(),
    );
    if (!access.ok) {
      throw accessError(access.code);
    }
    requireMethod(request.method, route.action);

    if (route.action === "push") {
      const input = await readBoundedJson(request);
      const pushRequest = parseSyncPushRequest(input);
      if (!membershipAllowsDevice(access.access.membership, pushRequest.deviceId)) {
        throw new PublicApiError(403, "device_not_authorized");
      }
      const workspace = dependencies.resolveWorkspace(route.workspaceId);
      const result = await workspace.pushOperations(pushRequest);
      if (!result.ok) {
        throw contractError(result.error.code);
      }
      return jsonResponse(result.response);
    }

    const { cursor, limit } = parsePullQuery(new URL(request.url));
    const workspace = dependencies.resolveWorkspace(route.workspaceId);
    const rawResponse = await workspace.pullOperations(cursor, limit);
    const parsedResponse: unknown = JSON.parse(rawResponse);
    const response: SyncPullResponse = parseSyncPullResponse(parsedResponse);
    return jsonResponse(response);
  } catch (error) {
    const publicError = normalizePublicError(error);
    dependencies.log({
      event:
        publicError.status >= 500
          ? "sync_request_failed"
          : "sync_request_rejected",
      code: publicError.code,
      status: publicError.status,
      route: route.action,
      method: request.method,
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

function matchSyncRoute(pathname: string): SyncRoute | null {
  const parts = pathname.split("/");
  if (
    parts.length !== 5 ||
    parts[0] !== "" ||
    parts[1] !== "v1" ||
    parts[2] !== "workspaces" ||
    parts[3] === "" ||
    (parts[4] !== "push" && parts[4] !== "pull")
  ) {
    return null;
  }
  return { workspaceId: parts[3]!, action: parts[4] };
}

function requireMethod(method: string, action: SyncRoute["action"]): void {
  const expected = action === "push" ? "POST" : "GET";
  if (method !== expected) {
    throw new PublicApiError(405, "method_not_allowed");
  }
}

async function readBoundedJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("Content-Type");
  if (contentType?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
    throw new PublicApiError(400, "invalid_request");
  }
  const declaredLength = request.headers.get("Content-Length");
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength)) {
      throw new PublicApiError(400, "invalid_request");
    }
    if (Number(declaredLength) > MAX_SYNC_BATCH_BYTES) {
      throw new PublicApiError(413, "request_too_large");
    }
  }
  if (request.body === null) {
    throw new PublicApiError(400, "invalid_request");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }
    byteLength += chunk.value.byteLength;
    if (byteLength > MAX_SYNC_BATCH_BYTES) {
      await reader.cancel();
      throw new PublicApiError(413, "request_too_large");
    }
    chunks.push(chunk.value);
  }

  const body = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
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
  if (url.searchParams.get("syncProtocolVersion") !== "1") {
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
