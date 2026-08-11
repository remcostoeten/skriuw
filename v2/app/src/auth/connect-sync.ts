import { connectWorkspaceSync } from "@/bridge/commands";
import { reclaimBoundStarterPreview } from "@/starter/reclaim";
import { currentSessionToken } from "./session-token";

/**
 * Links this device to its cloud workspace using the stored session credential.
 * An account has no capability other than sync, so authenticating is the point
 * at which the user asked for it; pausing afterwards stays a separate choice.
 */
export async function connectSyncForCurrentSession(): Promise<void> {
  const token = await currentSessionToken();
  if (!token) return;
  // Untouched preview notes are discarded before the first push so they never
  // land in an account that already holds a real workspace.
  await reclaimBoundStarterPreview();
  await connectWorkspaceSync(token);
}
