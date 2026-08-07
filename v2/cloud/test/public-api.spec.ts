import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import goldenPush from "../../contracts/fixtures/sync-push-v1.json";
import { WorkspaceContentStore } from "../src/content-store";
import {
  type CredentialVerification,
  type CredentialVerifier,
  type ReadySyncAccessConfiguration,
  type SyncAccessConfiguration,
  type WorkspaceMembershipLookup,
  type WorkspaceMembershipSource,
} from "../src/access";
import {
  type PublicSyncDependencies,
  type SyncSecurityLogEvent,
  handlePublicSyncRequest,
} from "../src/public-api";

const NOW = 1_900_000_000;
const VALID_TOKEN = "valid-token";
const SUBJECT = "user-1";
const DEVICE_ID = "device-1";

class DeterministicCredentialVerifier implements CredentialVerifier {
  readonly calls: string[] = [];
  readonly results = new Map<string, CredentialVerification>();
  throws = false;

  constructor() {
    this.results.set(VALID_TOKEN, {
      ok: true,
      identity: {
        subject: SUBJECT,
        sessionId: "session-1",
        expiresAtEpochSeconds: NOW + 3_600,
      },
    });
    this.results.set("invalid-token", { ok: false, code: "credential_invalid" });
    this.results.set("expired-token", { ok: false, code: "credential_expired" });
    this.results.set("revoked-token", { ok: false, code: "credential_revoked" });
  }

  async verifyBearerToken(
    token: string,
    _nowEpochSeconds: number,
  ): Promise<CredentialVerification> {
    this.calls.push(token);
    if (this.throws) {
      throw new Error("private provider response");
    }
    return this.results.get(token) ?? { ok: false, code: "credential_invalid" };
  }
}

class DeterministicMembershipSource implements WorkspaceMembershipSource {
  readonly calls: Array<{ subject: string; workspaceId: string }> = [];
  readonly results = new Map<string, WorkspaceMembershipLookup>();
  throws = false;

  async lookupMembership(
    trustedSubject: string,
    workspaceId: string,
  ): Promise<WorkspaceMembershipLookup> {
    this.calls.push({ subject: trustedSubject, workspaceId });
    if (this.throws) {
      throw new Error("private membership response");
    }
    return this.results.get(`${trustedSubject}:${workspaceId}`) ?? { state: "denied" };
  }

  allow(
    workspaceId: string,
    role: "owner" | "editor" | "viewer" = "editor",
    deviceIds: readonly string[] = [DEVICE_ID],
  ): void {
    this.results.set(`${SUBJECT}:${workspaceId}`, {
      state: "active",
      membership: { role, deviceIds },
    });
  }

  deny(workspaceId: string): void {
    this.results.set(`${SUBJECT}:${workspaceId}`, { state: "denied" });
  }
}

type TestContext = {
  credentials: DeterministicCredentialVerifier;
  memberships: DeterministicMembershipSource;
  logs: SyncSecurityLogEvent[];
  resolvedWorkspaces: string[];
  dependencies: PublicSyncDependencies;
};

function createContext(
  configuration?: SyncAccessConfiguration,
): TestContext {
  const credentials = new DeterministicCredentialVerifier();
  const memberships = new DeterministicMembershipSource();
  const logs: SyncSecurityLogEvent[] = [];
  const resolvedWorkspaces: string[] = [];
  const readyConfiguration: ReadySyncAccessConfiguration = {
    state: "ready",
    credentialVerifier: credentials,
    membershipSource: memberships,
  };
  return {
    credentials,
    memberships,
    logs,
    resolvedWorkspaces,
    dependencies: {
      accessConfiguration: configuration ?? readyConfiguration,
      resolveWorkspace(workspaceId) {
        resolvedWorkspaces.push(workspaceId);
        return env.WORKSPACES.getByName(workspaceId);
      },
      contentStore: new WorkspaceContentStore(env.SYNC_CONTENT),
      log(event) {
        logs.push(event);
      },
      nowEpochSeconds: () => NOW,
    },
  };
}

function pushRequest(
  workspaceId: string,
  body: unknown = goldenPush,
  token: string | null = VALID_TOKEN,
  headers?: HeadersInit,
): Request {
  const requestHeaders = new Headers(headers);
  requestHeaders.set("Content-Type", "application/json");
  if (token !== null) {
    requestHeaders.set("Authorization", `Bearer ${token}`);
  }
  return new Request(`https://example.test/v1/workspaces/${workspaceId}/push`, {
    method: "POST",
    headers: requestHeaders,
    body: JSON.stringify(body),
  });
}

function pullRequest(workspaceId: string, token = VALID_TOKEN): Request {
  return new Request(
    `https://example.test/v1/workspaces/${workspaceId}/pull?` +
      "syncProtocolVersion=1&afterServerSequence=0&limit=128",
    { headers: { Authorization: `Bearer ${token}` } },
  );
}

async function responseBody(response: Response): Promise<{ error?: string }> {
  return response.json<{ error?: string }>();
}

describe("public sync authentication", () => {
  it.each([
    ["sync_authentication_not_configured"],
    ["sync_authorization_not_configured"],
    ["sync_security_configuration_invalid"],
  ] as const)("fails closed for %s", async (code) => {
    const context = createContext({ state: "unavailable", code });
    const response = await handlePublicSyncRequest(
      pushRequest("workspace-config"),
      context.dependencies,
    );

    expect(response.status).toBe(503);
    expect(await responseBody(response)).toEqual({ error: code });
    expect(context.resolvedWorkspaces).toEqual([]);
  });

  it.each([
    [null, "credential_missing"],
    ["malformed value", "credential_malformed"],
    ["invalid-token", "credential_invalid"],
    ["expired-token", "credential_expired"],
    ["revoked-token", "credential_revoked"],
  ] as const)("rejects a %s credential as %s", async (token, code) => {
    const context = createContext();
    context.memberships.allow("workspace-credentials");
    const request = pushRequest("workspace-credentials", goldenPush, token);
    if (token === "malformed value") {
      request.headers.set("Authorization", "Basic malformed-value");
    }

    const response = await handlePublicSyncRequest(request, context.dependencies);

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toBe(
      'Bearer realm="skriuw-sync"',
    );
    expect(await responseBody(response)).toEqual({ error: code });
    expect(context.memberships.calls).toEqual([]);
    expect(context.resolvedWorkspaces).toEqual([]);
  });

  it("does not cache credential validity across requests", async () => {
    const context = createContext();
    context.memberships.allow("workspace-revocation");

    const first = await handlePublicSyncRequest(
      pullRequest("workspace-revocation"),
      context.dependencies,
    );
    expect(first.status).toBe(200);

    context.credentials.results.set(VALID_TOKEN, {
      ok: false,
      code: "credential_revoked",
    });
    const revoked = await handlePublicSyncRequest(
      pullRequest("workspace-revocation"),
      context.dependencies,
    );
    expect(revoked.status).toBe(401);
    expect(await responseBody(revoked)).toEqual({ error: "credential_revoked" });
    expect(context.resolvedWorkspaces).toEqual(["workspace-revocation"]);
  });

  it("fails closed when credential or membership providers throw", async () => {
    const authentication = createContext();
    authentication.credentials.throws = true;
    let response = await handlePublicSyncRequest(
      pullRequest("workspace-provider-error"),
      authentication.dependencies,
    );
    expect(response.status).toBe(503);
    expect(await responseBody(response)).toEqual({
      error: "sync_authentication_unavailable",
    });

    const authorization = createContext();
    authorization.memberships.throws = true;
    response = await handlePublicSyncRequest(
      pullRequest("workspace-provider-error"),
      authorization.dependencies,
    );
    expect(response.status).toBe(503);
    expect(await responseBody(response)).toEqual({
      error: "sync_authorization_unavailable",
    });
    expect(authentication.resolvedWorkspaces).toEqual([]);
    expect(authorization.resolvedWorkspaces).toEqual([]);
  });
});

describe("public sync workspace authorization", () => {
  it("permits owner/editor push and viewer pull while denying viewer push", async () => {
    const owner = createContext();
    owner.memberships.allow("workspace-owner", "owner");
    const ownerPush = await handlePublicSyncRequest(
      pushRequest("workspace-owner"),
      owner.dependencies,
    );
    expect(ownerPush.status).toBe(200);

    const editor = createContext();
    editor.memberships.allow("workspace-editor", "editor");
    const editorPush = await handlePublicSyncRequest(
      pushRequest("workspace-editor"),
      editor.dependencies,
    );
    expect(editorPush.status).toBe(200);

    const viewer = createContext();
    viewer.memberships.allow("workspace-viewer", "viewer");
    const viewerPull = await handlePublicSyncRequest(
      pullRequest("workspace-viewer"),
      viewer.dependencies,
    );
    expect(viewerPull.status).toBe(200);
    const viewerPush = await handlePublicSyncRequest(
      pushRequest("workspace-viewer"),
      viewer.dependencies,
    );
    expect(viewerPush.status).toBe(403);
    expect(await responseBody(viewerPush)).toEqual({
      error: "workspace_permission_denied",
    });
    expect(viewer.resolvedWorkspaces).toEqual(["workspace-viewer"]);
  });

  it.each([
    ["workspace-non-member"],
    ["workspace-removed-member"],
    ["workspace-deleted"],
    ["workspace-guessed"],
  ] as const)("conceals denied workspace state for %s", async (workspaceId) => {
    const context = createContext();
    context.memberships.deny(workspaceId);

    const response = await handlePublicSyncRequest(
      pullRequest(workspaceId),
      context.dependencies,
    );

    expect(response.status).toBe(404);
    expect(await responseBody(response)).toEqual({
      error: "workspace_access_denied",
    });
    expect(context.resolvedWorkspaces).toEqual([]);
  });

  it("does not cache membership after removal", async () => {
    const context = createContext();
    context.memberships.allow("workspace-removal", "viewer");
    const first = await handlePublicSyncRequest(
      pullRequest("workspace-removal"),
      context.dependencies,
    );
    expect(first.status).toBe(200);

    context.memberships.deny("workspace-removal");
    const removed = await handlePublicSyncRequest(
      pullRequest("workspace-removal"),
      context.dependencies,
    );
    expect(removed.status).toBe(404);
    expect(context.resolvedWorkspaces).toEqual(["workspace-removal"]);
  });

  it("binds push device IDs to server-owned membership", async () => {
    const context = createContext();
    context.memberships.allow("workspace-device", "editor", ["device-allowed"]);

    const response = await handlePublicSyncRequest(
      pushRequest("workspace-device"),
      context.dependencies,
    );

    expect(response.status).toBe(403);
    expect(await responseBody(response)).toEqual({
      error: "device_not_authorized",
    });
    expect(context.resolvedWorkspaces).toEqual([]);
  });

  it("stops an already valid device on the next request after removal", async () => {
    const context = createContext();
    context.memberships.allow("workspace-device-removal");
    const first = await handlePublicSyncRequest(
      pushRequest("workspace-device-removal"),
      context.dependencies,
    );
    expect(first.status).toBe(200);

    context.memberships.allow("workspace-device-removal", "editor", []);
    const removed = await handlePublicSyncRequest(
      pushRequest("workspace-device-removal"),
      context.dependencies,
    );
    expect(removed.status).toBe(403);
    expect(await responseBody(removed)).toEqual({
      error: "device_not_authorized",
    });
    expect(context.resolvedWorkspaces).toEqual(["workspace-device-removal"]);
  });

  it("rejects caller-supplied identity claims instead of treating them as authority", async () => {
    const context = createContext();
    context.memberships.allow("workspace-claims");
    const claimed = { ...structuredClone(goldenPush), userId: "admin" };

    const response = await handlePublicSyncRequest(
      pushRequest("workspace-claims", claimed),
      context.dependencies,
    );

    expect(response.status).toBe(400);
    expect(await responseBody(response)).toEqual({ error: "sync_rejected" });
    expect(context.memberships.calls).toEqual([
      { subject: SUBJECT, workspaceId: "workspace-claims" },
    ]);
    expect(context.resolvedWorkspaces).toEqual([]);
  });

  it("authenticates and authorizes before resolving a workspace object", async () => {
    const context = createContext();
    context.memberships.deny("workspace-cross-account");

    const response = await handlePublicSyncRequest(
      pushRequest("workspace-cross-account"),
      context.dependencies,
    );

    expect(response.status).toBe(404);
    expect(context.credentials.calls).toEqual([VALID_TOKEN]);
    expect(context.memberships.calls).toEqual([
      { subject: SUBJECT, workspaceId: "workspace-cross-account" },
    ]);
    expect(context.resolvedWorkspaces).toEqual([]);
  });
});

describe("public sync validation and ordered-log integration", () => {
  it("rejects malformed JSON, unsupported versions, invalid operation fields, and oversized bodies", async () => {
    const context = createContext();
    context.memberships.allow("workspace-validation");

    const malformed = pushRequest("workspace-validation");
    const malformedRequest = new Request(malformed.url, {
      method: "POST",
      headers: malformed.headers,
      body: "{",
    });
    let response = await handlePublicSyncRequest(
      malformedRequest,
      context.dependencies,
    );
    expect(response.status).toBe(400);
    expect(await responseBody(response)).toEqual({ error: "invalid_request" });

    const unknownVersion = structuredClone(goldenPush);
    unknownVersion.syncProtocolVersion = 2;
    response = await handlePublicSyncRequest(
      pushRequest("workspace-validation", unknownVersion),
      context.dependencies,
    );
    expect(await responseBody(response)).toEqual({ error: "sync_rejected" });

    const invalidOperation = structuredClone(goldenPush);
    delete (invalidOperation.operations[0]!.operation.operation as { title?: string }).title;
    response = await handlePublicSyncRequest(
      pushRequest("workspace-validation", invalidOperation),
      context.dependencies,
    );
    expect(await responseBody(response)).toEqual({ error: "sync_rejected" });

    const oversized = pushRequest("workspace-validation", goldenPush, VALID_TOKEN, {
      "Content-Length": String(8 * 1024 * 1024 + 1),
    });
    response = await handlePublicSyncRequest(oversized, context.dependencies);
    expect(response.status).toBe(413);
    expect(await responseBody(response)).toEqual({ error: "request_too_large" });
    expect(context.resolvedWorkspaces).toEqual([]);
  });

  it("preserves retry, conflict, sequence, ordered pull, and isolation semantics", async () => {
    const context = createContext();
    context.memberships.allow("workspace-public-log");
    context.memberships.allow("workspace-public-empty", "viewer");
    const batch = structuredClone(goldenPush);
    const second = structuredClone(batch.operations[0]!);
    second.operationId = "operation-2";
    second.clientSequence = 2;
    second.operation.operation.id = "folder-2";
    second.operation.operation.title = "Second folder";
    second.operation.operation.at = 2;
    batch.operations.push(second);

    const first = await handlePublicSyncRequest(
      pushRequest("workspace-public-log", batch),
      context.dependencies,
    );
    const retry = await handlePublicSyncRequest(
      pushRequest("workspace-public-log", batch),
      context.dependencies,
    );
    expect(first.status).toBe(200);
    expect(await retry.json()).toEqual(await first.json());

    const conflicting = structuredClone(goldenPush);
    conflicting.operations[0]!.operation.operation.title = "private note title";
    const conflict = await handlePublicSyncRequest(
      pushRequest("workspace-public-log", conflicting),
      context.dependencies,
    );
    expect(await responseBody(conflict)).toEqual({ error: "sync_rejected" });

    const gap = structuredClone(goldenPush);
    gap.operations[0]!.operationId = "operation-gap";
    gap.operations[0]!.clientSequence = 4;
    const gapResponse = await handlePublicSyncRequest(
      pushRequest("workspace-public-log", gap),
      context.dependencies,
    );
    expect(await responseBody(gapResponse)).toEqual({ error: "sync_rejected" });

    const pull = await handlePublicSyncRequest(
      pullRequest("workspace-public-log"),
      context.dependencies,
    );
    const pulled = await pull.json<{ operations: Array<{ serverSequence: number }> }>();
    expect(pulled.operations.map((operation) => operation.serverSequence)).toEqual([
      1, 2,
    ]);

    const isolated = await handlePublicSyncRequest(
      pullRequest("workspace-public-empty"),
      context.dependencies,
    );
    expect(await isolated.json<{ operations: unknown[] }>()).toMatchObject({
      operations: [],
    });
  });

  it("returns and logs only stable sanitized fields", async () => {
    const context = createContext();
    const secretToken = "secret-token-never-log";
    const privateWorkspace = "private-workspace-never-log";
    context.credentials.results.set(secretToken, {
      ok: false,
      code: "credential_invalid",
    });

    const response = await handlePublicSyncRequest(
      pushRequest(privateWorkspace, goldenPush, secretToken),
      context.dependencies,
    );
    const responseText = await response.text();
    const logText = JSON.stringify(context.logs);

    expect(responseText).toBe('{"error":"credential_invalid"}');
    expect(logText).not.toContain(secretToken);
    expect(logText).not.toContain(privateWorkspace);
    expect(logText).not.toContain("create_folder");
    expect(logText).not.toContain("Folder");
  });
});
