import { authConfiguration } from "./config";
import { currentSessionToken } from "./session";

/**
 * @name deleteCloudAccount
 * @description Requests permanent cloud account and workspace deletion using
 * the current signed-in session.
 *
 * @example
 * await deleteCloudAccount();
 */
export async function deleteCloudAccount(): Promise<void> {
  if (!authConfiguration.available) throw new Error(authConfiguration.reason);
  const token = await currentSessionToken();
  if (!token) throw new Error("Sign in again before deleting this account.");
  const response = await fetch(`${authConfiguration.baseUrl}/v1/account`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const code =
      typeof payload === "object" && payload !== null && "error" in payload
        ? String(payload.error)
        : "account_deletion_failed";
    throw new Error(
      code === "account_deletion_failed"
        ? "The cloud account could not be deleted. Try again."
        : code === "workspace_purge_failed"
          ? "Cloud data could not be fully removed. Try again to finish deletion."
          : code === "recent_sign_in_required"
            ? "Sign out and sign back in, then retry account deletion."
          : code,
    );
  }
}
