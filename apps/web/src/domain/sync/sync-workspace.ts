import type { WorkspaceBackend } from "@/core/workspace-backend";
import { pullWorkspaceFromServer, type PullResult } from "@/domain/sync/pull-workspace";
import {
	getWorkspaceSnapshotIds,
	pushWorkspaceToServer,
	type PushResult,
} from "@/domain/sync/push-workspace";
import { setSyncClientConfig, type SyncClientConfig } from "@/domain/sync/sync-client-config";

export type DesktopSyncResult = { push: PushResult; pull: PullResult };

let activeSync: Promise<DesktopSyncResult> | null = null;

export async function syncDesktopWorkspace(
	backend: WorkspaceBackend,
	config: SyncClientConfig,
): Promise<DesktopSyncResult> {
	if (!config.enabled) throw new Error("Cloud sync is not enabled.");
	if (activeSync) return activeSync;
	activeSync = runDesktopSync(backend, config).finally(() => {
		activeSync = null;
	});
	return activeSync;
}

async function runDesktopSync(
	backend: WorkspaceBackend,
	config: SyncClientConfig,
): Promise<DesktopSyncResult> {
	const push = await pushWorkspaceToServer(backend, config);
	const pushedConfig = {
		...config,
		lastSyncedAt: push.syncedAt,
		lastSnapshotIds: push.snapshotIds,
	};
	// Persist the successful push boundary before pulling. If the pull is
	// interrupted, a retry will not misclassify the same writes as conflicts.
	setSyncClientConfig(pushedConfig);
	const pull = await pullWorkspaceFromServer(backend, config.serverUrl, config.token);
	const lastSnapshotIds = await getWorkspaceSnapshotIds(backend);
	setSyncClientConfig({ ...pushedConfig, lastSnapshotIds });
	return { push, pull };
}
