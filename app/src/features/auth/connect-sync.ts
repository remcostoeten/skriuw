import { connectWorkspaceSync } from "@/bridge/commands";
import {
  adoptBoundStarterPreview,
  reclaimBoundStarterPreview,
} from "@/features/onboarding/reclaim";
import { authConfiguration } from "./config";
import { currentSessionToken } from "./session-token";

type CloudWorkspaceState = "has-content" | "empty" | "unknown";

/**
 * Asks the cloud whether this account's workspace already holds replicated
 * history, without registering a device. A 404 means an older cloud deployment
 * that predates the route; every other failure propagates, because a cloud
 * that cannot answer this cannot run sync either.
 */
async function cloudWorkspaceState(token: string): Promise<CloudWorkspaceState> {
  if (!authConfiguration.available) {
    throw new Error(authConfiguration.reason);
  }
  const response = await fetch(`${authConfiguration.baseUrl}/v1/sync/state`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 404) {
    return "unknown";
  }
  if (!response.ok) {
    throw new Error(`the cloud workspace state request failed: ${response.status}`);
  }
  const body = (await response.json()) as { latestServerSequence?: unknown };
  if (typeof body.latestServerSequence !== "number") {
    throw new Error("the cloud workspace state response was invalid");
  }
  return body.latestServerSequence > 0 ? "has-content" : "empty";
}

/**
 * Links this device to its cloud workspace using the stored session credential.
 * An account has no capability other than sync, so authenticating is the point
 * at which the user asked for it; pausing afterwards stays a separate choice.
 *
 * Sign-in must never silently remove content, so the starter preview is only
 * reclaimed when the account already holds a real workspace the preview would
 * pollute. An empty account adopts the preview instead: the notes sync up as
 * its first content. When the cloud predates the state route the legacy
 * reclaim runs, and when the cloud is unreachable neither decision is made —
 * the thrown error also keeps sync from connecting and pushing prematurely.
 */
export async function connectSyncForCurrentSession(): Promise<void> {
  const token = await currentSessionToken();
  if (!token) return;
  if (!authConfiguration.available) {
    throw new Error(authConfiguration.reason);
  }
  const state = await cloudWorkspaceState(token);
  if (state === "empty") {
    await adoptBoundStarterPreview();
  } else {
    await reclaimBoundStarterPreview();
  }
  await connectWorkspaceSync(token, authConfiguration.baseUrl);
}
