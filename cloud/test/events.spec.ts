import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import goldenPush from "../../contracts/fixtures/sync-push-v1.json";
import { WorkspaceContentStore } from "../src/content-store";
import {
  type CredentialVerification,
  type CredentialVerifier,
  type ReadySyncAccessConfiguration,
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
const OTHER_DEVICE_ID = "device-2";

class DeterministicCredentialVerifier implements CredentialVerifier {
  readonly results = new Map<string, CredentialVerification>();

  constructor() {
    this.results.set(VALID_TOKEN, {
      ok: true,
      identity: {
        subject: SUBJECT,
        sessionId: "session-1",
        expiresAtEpochSeconds: NOW + 3_600,
      },
    });
  }

  async verifyBearerToken(token: string): Promise<CredentialVerification> {
    return this.results.get(token) ?? { ok: false, code: "credential_invalid" };
  }
}

class DeterministicMembershipSource implements WorkspaceMembershipSource {
  readonly results = new Map<string, WorkspaceMembershipLookup>();

  async lookupMembership(
    trustedSubject: string,
    workspaceId: string,
  ): Promise<WorkspaceMembershipLookup> {
    return this.results.get(`${trustedSubject}:${workspaceId}`) ?? { state: "denied" };
  }

  allow(
    workspaceId: string,
    deviceIds: readonly string[] = [DEVICE_ID, OTHER_DEVICE_ID],
  ): void {
    this.results.set(`${SUBJECT}:${workspaceId}`, {
      state: "active",
      membership: { role: "editor", deviceIds },
    });
  }
}

type TestContext = {
  credentials: DeterministicCredentialVerifier;
  memberships: DeterministicMembershipSource;
  logs: SyncSecurityLogEvent[];
  dependencies: PublicSyncDependencies;
};

function createContext(): TestContext {
  const credentials = new DeterministicCredentialVerifier();
  const memberships = new DeterministicMembershipSource();
  const logs: SyncSecurityLogEvent[] = [];
  const configuration: ReadySyncAccessConfiguration = {
    state: "ready",
    credentialVerifier: credentials,
    membershipSource: memberships,
  };
  return {
    credentials,
    memberships,
    logs,
    dependencies: {
      accessConfiguration: configuration,
      resolveWorkspace(workspaceId) {
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

function eventsRequest(
  workspaceId: string,
  options: {
    deviceId?: string;
    token?: string | null;
    subprotocols?: string;
    upgrade?: string | null;
  } = {},
): Request {
  const headers = new Headers();
  const upgrade = options.upgrade === undefined ? "websocket" : options.upgrade;
  if (upgrade !== null) {
    headers.set("Upgrade", upgrade);
  }
  const token = options.token === undefined ? VALID_TOKEN : options.token;
  if (options.subprotocols !== undefined) {
    headers.set("Sec-WebSocket-Protocol", options.subprotocols);
  } else if (token !== null) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const deviceId = options.deviceId ?? DEVICE_ID;
  return new Request(
    `https://example.test/v1/workspaces/${workspaceId}/events?deviceId=${deviceId}`,
    { headers },
  );
}

async function openEventsSocket(
  workspaceId: string,
  dependencies: PublicSyncDependencies,
  options: Parameters<typeof eventsRequest>[1] = {},
): Promise<WebSocket> {
  const response = await handlePublicSyncRequest(
    eventsRequest(workspaceId, options),
    dependencies,
  );
  expect(response.status).toBe(101);
  const socket = response.webSocket;
  expect(socket).not.toBeNull();
  socket!.accept();
  return socket!;
}

function collectMessages(socket: WebSocket): string[] {
  const messages: string[] = [];
  socket.addEventListener("message", (event) => {
    messages.push(String(event.data));
  });
  return messages;
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 50));
}

function pushRequest(workspaceId: string): Request {
  return new Request(`https://example.test/v1/workspaces/${workspaceId}/push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${VALID_TOKEN}`,
    },
    body: JSON.stringify(goldenPush),
  });
}

describe("sync events channel", () => {
  it("accepts an authorized upgrade with the bearer header", async () => {
    const context = createContext();
    context.memberships.allow("events-header-auth");

    const socket = await openEventsSocket("events-header-auth", context.dependencies);
    socket.close();
  });

  it("accepts a subprotocol credential and echoes the sync subprotocol", async () => {
    const context = createContext();
    context.memberships.allow("events-subprotocol");

    const response = await handlePublicSyncRequest(
      eventsRequest("events-subprotocol", {
        token: null,
        subprotocols: `skriuw-sync-v1, skriuw-bearer.${VALID_TOKEN}`,
      }),
      context.dependencies,
    );

    expect(response.status).toBe(101);
    expect(response.headers.get("Sec-WebSocket-Protocol")).toBe("skriuw-sync-v1");
    response.webSocket!.accept();
    response.webSocket!.close();
  });

  it("rejects a missing credential", async () => {
    const context = createContext();
    context.memberships.allow("events-missing-credential");

    const response = await handlePublicSyncRequest(
      eventsRequest("events-missing-credential", { token: null }),
      context.dependencies,
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "credential_missing" });
  });

  it("rejects a non-member", async () => {
    const context = createContext();

    const response = await handlePublicSyncRequest(
      eventsRequest("events-non-member"),
      context.dependencies,
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "workspace_access_denied" });
  });

  it("rejects an unbound device", async () => {
    const context = createContext();
    context.memberships.allow("events-unbound-device", [OTHER_DEVICE_ID]);

    const response = await handlePublicSyncRequest(
      eventsRequest("events-unbound-device"),
      context.dependencies,
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "device_not_authorized" });
  });

  it("rejects a plain GET without an upgrade", async () => {
    const context = createContext();
    context.memberships.allow("events-no-upgrade");

    const response = await handlePublicSyncRequest(
      eventsRequest("events-no-upgrade", { upgrade: null }),
      context.dependencies,
    );

    expect(response.status).toBe(426);
    expect(await response.json()).toEqual({ error: "upgrade_required" });
  });

  it("notifies other devices after a push, but never the pusher", async () => {
    const context = createContext();
    context.memberships.allow("events-broadcast");

    const pusherSocket = await openEventsSocket("events-broadcast", context.dependencies, {
      deviceId: DEVICE_ID,
    });
    const listenerSocket = await openEventsSocket(
      "events-broadcast",
      context.dependencies,
      { deviceId: OTHER_DEVICE_ID },
    );
    const pusherMessages = collectMessages(pusherSocket);
    const listenerMessages = collectMessages(listenerSocket);

    const pushed = await handlePublicSyncRequest(
      pushRequest("events-broadcast"),
      context.dependencies,
    );
    expect(pushed.status).toBe(200);
    await settle();

    expect(pusherMessages).toEqual([]);
    expect(listenerMessages).toEqual([
      JSON.stringify({ type: "workspaceChanged", latestServerSequence: 1 }),
    ]);

    pusherSocket.close();
    listenerSocket.close();
  });
});
