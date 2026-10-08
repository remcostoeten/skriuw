import type { NativeBridge } from "../../bridge/native-adapter";

export const ACCOUNT_UNAVAILABLE_ON_WEB =
  "Signing in needs the Skriuw app on a phone. This web preview keeps its notes in memory only.";

/**
 * The bridge the account runs sync through: the same native bridge the
 * workspace opens, so routing an account and reopening the workspace act on
 * one handle. Resolves `null` where no native core exists.
 */
export async function loadAccountBridge(): Promise<NativeBridge | null> {
  const { nativeBridge } = await import("../../bridge/native-bridge");
  return nativeBridge;
}
