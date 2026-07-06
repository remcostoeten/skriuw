import { zipSync } from "fflate";
import { buildExportArchiveFiles } from "@/domain/data-transfer/export-build";
import { normalizeServerUrl } from "@/domain/sync/pull-workspace";
import type { WorkspaceBackend } from "@/core/workspace-backend";

/**
 * One-way "push" sync for the desktop app: read the local Tauri workspace via the
 * backend's `list*` methods, assemble a Skriuw v3 ZIP identical in shape to what
 * `/api/sync/export` emits, and upload it to `/api/sync/import`. The archive is
 * built entirely in the webview with the same `buildExportArchiveFiles` +
 * `fflate` path the server uses, so a pushed workspace is byte-identical to a
 * server-exported one. Each note carries its `createdAt`/`updatedAt`, letting the
 * server reconcile with last-write-wins instead of blindly overwriting.
 */

export type PushResult = {
	notes: number;
	folders: number;
	journalEntries: number;
	journalTags: number;
	skipped: number;
};

type ArchiveInput = Parameters<typeof buildExportArchiveFiles>[0];
type ArchiveNote = ArchiveInput["notes"][number];

export function buildSyncImportUrl(serverUrl: string): string {
	return `${normalizeServerUrl(serverUrl)}/api/sync/import`;
}

export async function buildWorkspaceArchiveFromBackend(
	backend: WorkspaceBackend,
): Promise<Uint8Array> {
	const [notes, folders, journalEntries, journalTags] = await Promise.all([
		backend.listNotes?.() ?? Promise.resolve([]),
		backend.listFolders?.() ?? Promise.resolve([]),
		backend.listJournalEntries?.() ?? Promise.resolve([]),
		backend.listJournalTags?.() ?? Promise.resolve([]),
	]);

	const files = buildExportArchiveFiles({
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
			richContent: (note.richContent ?? null) as ArchiveNote["richContent"],
			tags: note.tags ?? [],
			parentId: note.parentId,
			sortOrder: note.sortOrder ?? 0,
			preferredEditorMode: note.preferredEditorMode ?? null,
			icon: note.icon ?? null,
			createdAt: note.createdAt,
			updatedAt: note.modifiedAt,
		})),
		journalEntries: journalEntries.map((entry) => ({
			id: entry.id,
			dateKey: entry.dateKey,
			content: entry.content,
			mood: entry.mood ?? null,
			tags: entry.tags,
		})),
		journalTags: journalTags.map((tag) => ({ name: tag.name, color: tag.color })),
		includeVersions: false,
	});

	return zipSync(files);
}

type ImportResponse = {
	imported?: {
		notes?: number;
		folders?: number;
		journalEntries?: number;
		journalTags?: number;
	};
	skipped?: number;
};

function toPushResult(payload: ImportResponse): PushResult {
	const imported = payload.imported ?? {};
	return {
		notes: imported.notes ?? 0,
		folders: imported.folders ?? 0,
		journalEntries: imported.journalEntries ?? 0,
		journalTags: imported.journalTags ?? 0,
		skipped: payload.skipped ?? 0,
	};
}

export async function pushWorkspaceToServer(
	backend: WorkspaceBackend,
	serverUrl: string,
	token: string,
): Promise<PushResult> {
	const archive = await buildWorkspaceArchiveFromBackend(backend);

	let response: Response;
	try {
		response = await fetch(buildSyncImportUrl(serverUrl), {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/zip",
			},
			body: new Blob([new Uint8Array(archive)], { type: "application/zip" }),
		});
	} catch {
		throw new Error("Could not reach the server. Check the URL and your connection.");
	}

	if (!response.ok) {
		if (response.status === 401) {
			throw new Error("Sync token was rejected. Generate a fresh one in the web app.");
		}
		if (response.status === 403) {
			throw new Error(
				"This sync token is read-only. Generate a read-write token in the web app.",
			);
		}
		throw new Error(`Server returned ${response.status} ${response.statusText || "error"}.`);
	}

	const payload = (await response.json()) as ImportResponse;
	return toPushResult(payload);
}
