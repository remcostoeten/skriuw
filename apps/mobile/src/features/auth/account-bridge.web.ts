import type { NativeBridge } from "../../bridge/native-adapter";

export { ACCOUNT_UNAVAILABLE_ON_WEB } from "./account-bridge";

/** The web preview has no native core, so it has no account either. */
export async function loadAccountBridge(): Promise<NativeBridge | null> {
  return null;
}
