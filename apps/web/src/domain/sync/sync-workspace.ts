import { pullWorkspaceFromServer, type PullResult } from "@/domain/sync/pull-workspace";
import { pushWorkspaceToServer, type PushResult } from "@/domain/sync/push-workspace";
import type { WorkspaceBackend } from "@/core/workspace-backend";

export type SyncResult = {
	pull: PullResult;
	push: PushResult;
};

/**
 * Two-way sync for the desktop app: pull remote changes into the local backend,
 * then push the reconciled local state back up.
 *
 * The ordering is deliberate. Pulling first lets the server's tombstones and
 * newer records land locally before we build the push archive, so we never
 * re-upload a stale local copy of something that was deleted or superseded on
 * the server (which would resurrect it). Pushing second uploads the merged
 * result. Both directions rely on ids for identity, so the round-trip is
 * idempotent.
 */
export async function syncWorkspaceWithServer(
	backend: WorkspaceBackend,
	serverUrl: string,
	token: string,
): Promise<SyncResult> {
	const pull = await pullWorkspaceFromServer(backend, serverUrl, token);
	const push = await pushWorkspaceToServer(backend, serverUrl, token);
	return { pull, push };
}
