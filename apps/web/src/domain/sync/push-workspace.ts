import type { WorkspaceBackend } from "@/core/workspace-backend";
import { normalizeServerUrl } from "@/domain/sync/pull-workspace";
import type { SyncClientConfig } from "@/domain/sync/sync-client-config";

export type PushResult = {
	created: number;
	updated: number;
	deleted: number;
	conflicts: number;
	syncedAt: string;
	snapshotIds: NonNullable<SyncClientConfig["lastSnapshotIds"]>;
};

export async function getWorkspaceSnapshotIds(
	backend: WorkspaceBackend,
): Promise<NonNullable<SyncClientConfig["lastSnapshotIds"]>> {
	const [notes, folders, journalEntries] = await Promise.all([
		backend.listNotes?.() ?? Promise.resolve([]),
		backend.listFolders?.() ?? Promise.resolve([]),
		backend.listJournalEntries?.() ?? Promise.resolve([]),
	]);
	return {
		notes: notes.map((note) => note.id),
		folders: folders.map((folder) => folder.id),
		journalEntries: journalEntries.map((entry) => entry.id),
	};
}

function removed(previous: string[] | undefined, current: string[]): string[] {
	const currentIds = new Set(current);
	return (previous ?? []).filter((id) => !currentIds.has(id));
}

export async function pushWorkspaceToServer(
	backend: WorkspaceBackend,
	config: SyncClientConfig,
): Promise<PushResult> {
	const [noteMetadata, folders, journalEntries] = await Promise.all([
		backend.listNotes?.() ?? Promise.resolve([]),
		backend.listFolders?.() ?? Promise.resolve([]),
		backend.listJournalEntries?.() ?? Promise.resolve([]),
	]);
	const notes = await backend.getNotes(noteMetadata.map((note) => note.id));
	const snapshotIds = {
		notes: notes.map((note) => note.id),
		folders: folders.map((folder) => folder.id),
		journalEntries: journalEntries.map((entry) => entry.id),
	};
	const previous = config.lastSnapshotIds;
	const payload = {
		lastSyncedAt: config.lastSyncedAt,
		folders: folders.map((folder) => ({
			id: folder.id,
			name: folder.name,
			parentId: folder.parentId,
			sortOrder: folder.sortOrder ?? 0,
		})),
		notes: notes.map((note) => ({
			id: note.id,
			name: note.name,
			content: note.content,
			richContent: note.richContent,
			preferredEditorMode: note.preferredEditorMode,
			parentId: note.parentId,
			sortOrder: note.sortOrder ?? 0,
			tags: note.tags ?? [],
			properties: note.properties ?? [],
			icon: note.icon,
			cover: note.cover,
			annotationScene: note.annotationScene,
			createdAt: note.createdAt.toISOString(),
			modifiedAt: note.modifiedAt.toISOString(),
		})),
		journalEntries: journalEntries.map((entry) => ({
			id: entry.id,
			dateKey: entry.dateKey,
			title: entry.title,
			content: entry.content,
			richContent: entry.richContent,
			tags: entry.tags,
			mood: entry.mood,
			createdAt: new Date(entry.createdAt).toISOString(),
			updatedAt: new Date(entry.updatedAt).toISOString(),
		})),
		deletedIds: {
			notes: removed(previous?.notes, snapshotIds.notes),
			folders: removed(previous?.folders, snapshotIds.folders),
			journalEntries: removed(previous?.journalEntries, snapshotIds.journalEntries),
		},
	};

	let response: Response;
	try {
		response = await fetch(`${normalizeServerUrl(config.serverUrl)}/api/sync/push`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${config.token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(payload),
		});
	} catch {
		throw new Error("Could not reach the server. Local changes remain safely queued.");
	}
	const body = (await response.json().catch(() => ({}))) as Partial<PushResult> & {
		error?: string;
	};
	if (!response.ok || !body.syncedAt) {
		throw new Error(body.error || "Cloud rejected the sync snapshot.");
	}
	return {
		created: body.created ?? 0,
		updated: body.updated ?? 0,
		deleted: body.deleted ?? 0,
		conflicts: body.conflicts ?? 0,
		syncedAt: body.syncedAt,
		snapshotIds,
	};
}
