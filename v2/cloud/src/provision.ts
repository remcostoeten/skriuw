import {
  type SyncAccessConfiguration,
  type SyncAccessFailureCode,
  authenticateSyncRequest,
} from "./access";

const MAX_PROVISION_BODY_BYTES = 1_024;

type ProvisionDependencies = {
  accessConfiguration: SyncAccessConfiguration;
  database: D1Database;
  nowEpochSeconds(): number;
};

export async function handleSyncProvisionRequest(
  request: Request,
  dependencies: ProvisionDependencies,
): Promise<Response> {
  if (request.method !== "POST") return errorResponse(405, "method_not_allowed");
  const authentication = await authenticateSyncRequest(
    request,
    dependencies.accessConfiguration,
    dependencies.nowEpochSeconds(),
  );
  if (!authentication.ok) return accessError(authentication.code);

  const body = await readProvisionBody(request);
  if (!body.ok) return errorResponse(body.status, body.code);
  const workspaceId = await workspaceIdFor(authentication.identity.subject);
  const now = dependencies.nowEpochSeconds();
  await dependencies.database.batch([
    dependencies.database
      .prepare(
        `INSERT OR IGNORE INTO sync_workspace
           (id, owner_user_id, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?3)`,
      )
      .bind(workspaceId, authentication.identity.subject, now),
    dependencies.database
      .prepare(
        `INSERT OR IGNORE INTO sync_membership
           (workspace_id, user_id, role, created_at)
         VALUES (?1, ?2, 'owner', ?3)`,
      )
      .bind(workspaceId, authentication.identity.subject, now),
    dependencies.database
      .prepare(
        `INSERT INTO sync_device
           (workspace_id, user_id, device_id, created_at, last_seen_at)
         VALUES (?1, ?2, ?3, ?4, ?4)
         ON CONFLICT(workspace_id, device_id) DO UPDATE SET
           last_seen_at = excluded.last_seen_at
         WHERE sync_device.user_id = excluded.user_id`,
      )
      .bind(workspaceId, authentication.identity.subject, body.deviceId, now),
  ]);
  return Response.json(
    { workspaceId, deviceId: body.deviceId, role: "owner" },
    { headers: { "Cache-Control": "no-store" } },
  );
}

async function readProvisionBody(
  request: Request,
): Promise<
  | { ok: true; deviceId: string }
  | { ok: false; status: number; code: string }
> {
  if (request.headers.get("Content-Type")?.split(";", 1)[0]?.trim() !== "application/json") {
    return { ok: false, status: 400, code: "invalid_request" };
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > MAX_PROVISION_BODY_BYTES) {
    return { ok: false, status: 413, code: "request_too_large" };
  }
  let value: unknown;
  try {
    value = JSON.parse(
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes),
    );
  } catch {
    return { ok: false, status: 400, code: "invalid_request" };
  }
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length !== 1 ||
    !("deviceId" in value) ||
    typeof value.deviceId !== "string" ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(value.deviceId)
  ) {
    return { ok: false, status: 400, code: "invalid_request" };
  }
  return { ok: true, deviceId: value.deviceId };
}

async function workspaceIdFor(subject: string): Promise<string> {
  const bytes = new TextEncoder().encode(`skriuw-sync-workspace-v1\0${subject}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return `w_${[...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function accessError(code: SyncAccessFailureCode): Response {
  if (
    code === "credential_missing" ||
    code === "credential_malformed" ||
    code === "credential_invalid" ||
    code === "credential_expired" ||
    code === "credential_revoked"
  ) {
    return errorResponse(401, code, { "WWW-Authenticate": 'Bearer realm="skriuw-sync"' });
  }
  return errorResponse(503, code);
}

function errorResponse(status: number, code: string, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Cache-Control", "no-store");
  return Response.json({ error: code }, { status, headers: responseHeaders });
}

export const provisionInternals = { readProvisionBody, workspaceIdFor };
