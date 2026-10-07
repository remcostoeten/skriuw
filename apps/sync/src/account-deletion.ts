import { type SyncAccessConfiguration, authenticateSyncRequest } from "./access";
import { provisionInternals } from "./provision";

type AccountDeletionDependencies = {
  accessConfiguration: SyncAccessConfiguration;
  database: D1Database;
  resolveWorkspace(workspaceId: string): {
    fetch(request: Request): Promise<Response>;
  };
  nowEpochSeconds(): number;
  hasFreshSession(headers: Headers): Promise<boolean>;
  deleteAuthUser(headers: Headers): Promise<void>;
};

/**
 * @name handleAccountDeletionRequest
 * @description Blocks account sync, purges its cloud workspace, then removes
 * its account record so partially completed deletion can be retried safely.
 *
 * @example
 * await handleAccountDeletionRequest(request, dependencies);
 */
export async function handleAccountDeletionRequest(
  request: Request,
  dependencies: AccountDeletionDependencies,
): Promise<Response> {
  const authentication = await authenticateSyncRequest(
    request,
    dependencies.accessConfiguration,
    dependencies.nowEpochSeconds(),
  );
  if (!authentication.ok) return Response.json({ error: authentication.code }, { status: 401 });

  const userId = authentication.identity.subject;
  const headers = new Headers(request.headers);
  try {
    if (!(await dependencies.hasFreshSession(headers))) {
      return Response.json({ error: "recent_sign_in_required" }, { status: 403 });
    }
  } catch (error) {
    console.error("account deletion session check failed", error);
    return Response.json({ error: "account_deletion_failed" }, { status: 503 });
  }
  const workspaceId = await provisionInternals.workspaceIdFor(userId);
  const now = dependencies.nowEpochSeconds();
  await dependencies.database
    .prepare("INSERT OR IGNORE INTO deleted_account(user_id, deleted_at) VALUES (?1, ?2)")
    .bind(userId, now)
    .run();

  const purgeResponse = await dependencies
    .resolveWorkspace(workspaceId)
    .fetch(new Request("https://workspace.internal/internal/purge", { method: "DELETE" }));
  if (!purgeResponse.ok) {
    return Response.json({ error: "workspace_purge_failed" }, { status: 503 });
  }

  await dependencies.database.batch([
    dependencies.database.prepare("DELETE FROM sync_device WHERE user_id = ?1").bind(userId),
    dependencies.database.prepare("DELETE FROM sync_membership WHERE user_id = ?1").bind(userId),
    dependencies.database.prepare("DELETE FROM sync_workspace WHERE owner_user_id = ?1").bind(userId),
    dependencies.database.prepare("DELETE FROM note_share WHERE owner_user_id = ?1").bind(userId),
  ]);

  try {
    await dependencies.deleteAuthUser(headers);
  } catch (error) {
    console.error("account auth record deletion failed", error);
    return Response.json({ error: "account_deletion_failed" }, { status: 503 });
  }
  return Response.json({ deleted: true }, { headers: { "Cache-Control": "no-store" } });
}
