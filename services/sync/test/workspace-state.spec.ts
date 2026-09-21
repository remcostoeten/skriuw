import { describe, expect, it } from "vitest";

import type {
  CredentialVerification,
  CredentialVerifier,
  SyncAccessConfiguration,
  WorkspaceMembershipLookup,
  WorkspaceMembershipSource,
} from "../src/access";
import type { WorkspaceSyncState } from "../src/contracts";
import {
  handleSyncWorkspaceStateRequest,
  provisionInternals,
} from "../src/provision";

const NOW = 1_900_000_000;
const VALID_TOKEN = "valid-token";
const SUBJECT = "user-1";

class DeterministicCredentialVerifier implements CredentialVerifier {
  async verifyBearerToken(token: string): Promise<CredentialVerification> {
    if (token === VALID_TOKEN) {
      return {
        ok: true,
        identity: {
          subject: SUBJECT,
          sessionId: "session-1",
          expiresAtEpochSeconds: NOW + 3_600,
        },
      };
    }
    return { ok: false, code: "credential_invalid" };
  }
}

class DenyingMembershipSource implements WorkspaceMembershipSource {
  async lookupMembership(): Promise<WorkspaceMembershipLookup> {
    return { state: "denied" };
  }
}

function makeContext(state: () => Promise<unknown>) {
  const accessConfiguration: SyncAccessConfiguration = {
    state: "ready",
    credentialVerifier: new DeterministicCredentialVerifier(),
    membershipSource: new DenyingMembershipSource(),
  };
  const resolved: string[] = [];
  return {
    resolved,
    dependencies: {
      accessConfiguration,
      resolveWorkspace: (workspaceId: string) => {
        resolved.push(workspaceId);
        return {
          workspaceState: () => state() as Promise<WorkspaceSyncState>,
        };
      },
      nowEpochSeconds: () => NOW,
    },
  };
}

function stateRequest(token: string | null, method = "GET"): Request {
  const headers = new Headers();
  if (token !== null) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return new Request("https://cloud.test/v1/sync/state", { method, headers });
}

function workspaceState(latestServerSequence: number, compactedThrough = 0): WorkspaceSyncState {
  return { latestServerSequence, compactedThrough };
}

describe("sync workspace state", () => {
  it("reports the caller's own workspace and its latest sequence", async () => {
    const context = makeContext(async () => workspaceState(42, 40));

    const response = await handleSyncWorkspaceStateRequest(
      stateRequest(VALID_TOKEN),
      context.dependencies,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const expectedWorkspaceId = await provisionInternals.workspaceIdFor(SUBJECT);
    expect(await response.json()).toEqual({
      workspaceId: expectedWorkspaceId,
      latestServerSequence: 42,
      compactedThrough: 40,
    });
    expect(context.resolved).toEqual([expectedWorkspaceId]);
  });

  it("reports zero for an account whose workspace holds no history", async () => {
    const context = makeContext(async () => workspaceState(0));

    const response = await handleSyncWorkspaceStateRequest(
      stateRequest(VALID_TOKEN),
      context.dependencies,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ latestServerSequence: 0, compactedThrough: 0 });
  });

  it("rejects an invalid credential without touching the workspace", async () => {
    const context = makeContext(async () => workspaceState(1));

    const response = await handleSyncWorkspaceStateRequest(
      stateRequest("invalid-token"),
      context.dependencies,
    );

    expect(response.status).toBe(401);
    expect(context.resolved).toEqual([]);
  });

  it("rejects non-GET methods", async () => {
    const context = makeContext(async () => workspaceState(1));

    const response = await handleSyncWorkspaceStateRequest(
      stateRequest(VALID_TOKEN, "POST"),
      context.dependencies,
    );

    expect(response.status).toBe(405);
  });

  it("reports the sync service as unavailable when the workspace cannot answer", async () => {
    const failing = makeContext(async () => {
      throw new Error("durable object unavailable");
    });
    const malformed = makeContext(async () => ({ operations: [] }));

    const failure = await handleSyncWorkspaceStateRequest(
      stateRequest(VALID_TOKEN),
      failing.dependencies,
    );
    const invalid = await handleSyncWorkspaceStateRequest(
      stateRequest(VALID_TOKEN),
      malformed.dependencies,
    );

    expect(failure.status).toBe(503);
    expect(invalid.status).toBe(503);
  });
});
