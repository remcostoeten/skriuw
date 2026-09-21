import type { BridgePort, WorkspaceSyncStatus } from "@skriuw/renderer-core/bridge/port";
import type { SessionStore } from "./session";

/**
 * Turning an account into a running replication, in the order ADR-0046
 * requires.
 *
 * Routing happens before anything connects. An account that does not own the
 * open local workspace is sent to its own storage instead, and the shell
 * reopens there — which is why `switched` returns without connecting rather
 * than falling through to a sync guard the user cannot act on.
 */

export type CloudWorkspaceState = {
  /** Whether the account already holds replicated history. */
  content: "has-content" | "empty" | "unknown";
  /** Null only on a cloud that predates the route and cannot name a workspace. */
  workspaceId: string | null;
};

export type ConnectOutcome =
  /** No credential on this device. The shell offers sign-in. */
  | { kind: "signed-out" }
  /**
   * This account owns different storage. Every open handle is bound to the
   * workspace it opened, so the shell closes them, reopens on the routed
   * directory and runs this flow again there.
   */
  | { kind: "reopen-required"; workspaceId: string }
  | { kind: "connected"; status: WorkspaceSyncStatus; workspaceId: string | null };

export type ConnectDependencies = {
  baseUrl: string;
  session: SessionStore;
  bridge: Pick<BridgePort, "adoptWorkspaceSlot" | "connectWorkspaceSync">;
  fetch: typeof globalThis.fetch;
};

/**
 * Asks the cloud which workspace this account owns and whether it already
 * holds replicated history, without registering a device. A 404 means a cloud
 * deployment that predates the route; every other failure propagates, because
 * a cloud that cannot answer this cannot run sync either.
 */
export async function readCloudWorkspaceState(
  dependencies: Pick<ConnectDependencies, "baseUrl" | "fetch">,
  token: string,
): Promise<CloudWorkspaceState> {
  const response = await dependencies.fetch(`${dependencies.baseUrl}/v1/sync/state`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (response.status === 404) {
    return { content: "unknown", workspaceId: null };
  }
  if (!response.ok) {
    throw new Error(`the cloud workspace state request failed: ${response.status}`);
  }
  const body = (await response.json()) as {
    latestServerSequence?: unknown;
    workspaceId?: unknown;
  };
  if (typeof body.latestServerSequence !== "number") {
    throw new Error("the cloud workspace state response was invalid");
  }
  return {
    content: body.latestServerSequence > 0 ? "has-content" : "empty",
    workspaceId: typeof body.workspaceId === "string" ? body.workspaceId : null,
  };
}

/**
 * Links this device to its cloud workspace using the stored credential.
 *
 * An account unlocks nothing but sync, so authenticating is the point at which
 * the user asked for it; pausing afterwards stays a separate choice. A cloud
 * that cannot be reached throws, and the thrown error also keeps sync from
 * connecting and pushing against a workspace whose identity is unknown.
 */
export async function connectSyncForCurrentSession(
  dependencies: ConnectDependencies,
): Promise<ConnectOutcome> {
  const token = await dependencies.session.current();
  if (token === null) return { kind: "signed-out" };

  const state = await readCloudWorkspaceState(dependencies, token);
  if (state.workspaceId !== null) {
    const adoption = await dependencies.bridge.adoptWorkspaceSlot(state.workspaceId);
    if (adoption === "switched") {
      return { kind: "reopen-required", workspaceId: state.workspaceId };
    }
  }
  const status = await dependencies.bridge.connectWorkspaceSync(token, dependencies.baseUrl);
  return { kind: "connected", status, workspaceId: state.workspaceId };
}
