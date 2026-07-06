import {
	exportFolderPaths,
	foldersFromNotePaths,
	sortFoldersForCreation,
} from "@/domain/data-transfer/folders";
import { parseImportBuffer } from "@/domain/data-transfer/parse-import";
import {
	isSkriuwManifestV2OrV3,
	type ParsedArchive,
	type SkriuwExportFolder,
} from "@/domain/data-transfer/types";
import type { RichTextDocument } from "@/domain/notes/models";
import type { MoodLevel } from "@/domain/journal/models";
import type { WorkspaceBackend } from "@/core/workspace-backend";

/**
 * One-way "pull" sync for the desktop app: download the cloud workspace from
 * `/api/sync/export` (a Skriuw v3 ZIP) and mirror it into the local Tauri
 * backend. We reuse the same archive parser as the web importer and the same
 * record-building `WorkspaceBackend.create*` methods the desktop uses for normal
 * edits, so pulled notes are byte-identical to natively-created ones. Writes are
 * upserts keyed on the server id, so re-pulling is idempotent (overwrites the
 * local copy with server state) rather than duplicating.
 */

export type PullResult = {
	folders: number;
	notes: number;
	journalEntries: number;
	journalTags: number;
};

function resolveManifestFolders(archive: ParsedArchive): SkriuwExportFolder[] {
	if (isSkriuwManifestV2OrV3(archive.manifest)) {
		return archive.manifest.folders;
	}
	// v1 archives carry no folder manifest — reconstruct the tree from note paths.
	return foldersFromNotePaths(archive.notes);
}

/**
 * Accepts what a user actually types — `localhost:3000`, `myhost.com`, or a full
 * URL — and returns a validated absolute origin with no trailing slash. A bare
 * host gets `http://` for localhost (local dev) and `https://` otherwise.
 */
export function normalizeServerUrl(input: string): string {
	const trimmed = input.trim().replace(/\/+$/, "");
	if (!trimmed) {
		throw new Error("Enter your server URL.");
	}

	let withScheme = trimmed;
	if (!/^https?:\/\//i.test(withScheme)) {
		const isLocal = /^(localhost|127\.0\.0\.1)(:|$|\/)/i.test(withScheme);
		withScheme = `${isLocal ? "http" : "https"}://${withScheme}`;
	}

	try {
		return new URL(withScheme).origin;
	} catch {
		throw new Error("That server URL doesn't look valid.");
	}
}

export function buildSyncExportUrl(serverUrl: string): string {
	const base = normalizeServerUrl(serverUrl);
	// Versions aren't stored by the desktop backend (restoreNoteVersion is a
	// no-op), so skip them to keep the payload small.
	return `${base}/api/sync/export?includeVersions=false`;
}

export async function fetchWorkspaceArchive(
	serverUrl: string,
	token: string,
): Promise<ParsedArchive> {
	let response: Response;
	try {
		response = await fetch(buildSyncExportUrl(serverUrl), {
			headers: { Authorization: `Bearer ${token}` },
		});
	} catch {
		throw new Error("Could not reach the server. Check the URL and your connection.");
	}

	if (!response.ok) {
		if (response.status === 401) {
			throw new Error("Sync token was rejected. Generate a fresh one in the web app.");
		}
		throw new Error(`Server returned ${response.status} ${response.statusText || "error"}.`);
	}

	const buffer = new Uint8Array(await response.arrayBuffer());
	return parseImportBuffer(buffer, "skriuw");
}

/** Ids/names tombstoned server-side since the last pull — see `SkriuwExportDeletedIds`. */
function manifestDeletedIds(archive: ParsedArchive) {
	const empty = { notes: [], folders: [], journalEntries: [], journalTagNames: [] };
	if (!isSkriuwManifestV2OrV3(archive.manifest) || archive.manifest.version !== 3) return empty;
	const deleted = archive.manifest.deletedIds;
	if (!deleted) return empty;
	return {
		notes: deleted.notes,
		folders: deleted.folders,
		journalEntries: deleted.journalEntries,
		journalTagNames: deleted.journalTags,
	};
}

export async function importArchiveToBackend(
	backend: WorkspaceBackend,
	archive: ParsedArchive,
): Promise<PullResult> {
	const folders = sortFoldersForCreation(resolveManifestFolders(archive));
	const pathById = exportFolderPaths(folders);
	const idByPath = new Map<string, string>();
	for (const [id, path] of pathById) {
		idByPath.set(path, id);
	}
	const deletedIds = manifestDeletedIds(archive);

	const notes = archive.notes.map((note) => ({
		id: note.id,
		name: note.name,
		content: note.content,
		richContent: (note.richContent as RichTextDocument | undefined) ?? undefined,
		preferredEditorMode: note.preferredEditorMode,
		parentId: note.parentPath ? (idByPath.get(note.parentPath) ?? null) : null,
		sortOrder: note.sortOrder,
		tags: note.tags,
	}));

	const journalEntries = archive.journalEntries.map((entry) => ({
		id: entry.id,
		dateKey: entry.dateKey,
		content: entry.content,
		mood: entry.mood as MoodLevel | undefined,
		tags: entry.tags,
	}));

	// Tag identity is by name everywhere — collect the wanted tags (manifest +
	// those referenced by entries); `importArchive`/the fallback below only
	// create names not already present locally.
	const wanted = new Map<string, string>();
	if (isSkriuwManifestV2OrV3(archive.manifest)) {
		for (const tag of archive.manifest.journalTags) {
			wanted.set(tag.name, tag.color);
		}
	}
	for (const entry of archive.journalEntries) {
		for (const tag of entry.tags) {
			if (!wanted.has(tag)) wanted.set(tag, "#64748b");
		}
	}
	const journalTags = Array.from(wanted, ([name, color]) => ({ name, color }));

	if (backend.importArchive) {
		await backend.importArchive({
			folders: folders.map((folder) => ({
				id: folder.id,
				name: folder.name,
				parentId: folder.parentId,
				sortOrder: folder.sortOrder,
			})),
			notes,
			journalEntries,
			journalTags,
			deletedIds,
		});
		return {
			folders: folders.length,
			notes: archive.notes.length,
			journalEntries: archive.journalEntries.length,
			journalTags: journalTags.length,
		};
	}

	// Fallback for backends that don't implement the atomic `importArchive`
	// path (none pull today, but this keeps the function backend-agnostic).
	// Parents are sorted before children, so each parentId is already mirrored
	// by the time its children are written.
	for (const folder of folders) {
		await backend.createFolder({
			id: folder.id,
			name: folder.name,
			parentId: folder.parentId,
			sortOrder: folder.sortOrder,
		});
	}
	await Promise.all(notes.map((note) => backend.createNote(note)));
	await Promise.all(journalEntries.map((entry) => backend.createJournalEntry(entry)));

	const existing = (await backend.listJournalTags?.()) ?? [];
	const existingNames = new Set(existing.map((tag) => tag.name));
	const tagsToCreate = journalTags.filter((tag) => !existingNames.has(tag.name));
	await Promise.all(tagsToCreate.map((tag) => backend.createJournalTag(tag)));
	const createdTags = tagsToCreate.length;

	await Promise.all(deletedIds.notes.map((id) => backend.deleteNote(id)));
	for (const id of deletedIds.folders) await backend.deleteFolder(id);
	await Promise.all(deletedIds.journalEntries.map((id) => backend.deleteJournalEntry(id)));
	if (deletedIds.journalTagNames.length > 0) {
		const tagIdByName = new Map(existing.map((tag) => [tag.name, tag.id]));
		const idsToDelete = deletedIds.journalTagNames
			.map((name) => tagIdByName.get(name))
			.filter((id): id is string => Boolean(id));
		await Promise.all(idsToDelete.map((id) => backend.deleteJournalTag(id)));
	}

	return {
		folders: folders.length,
		notes: archive.notes.length,
		journalEntries: archive.journalEntries.length,
		journalTags: createdTags,
	};
}

export async function pullWorkspaceFromServer(
	backend: WorkspaceBackend,
	serverUrl: string,
	token: string,
): Promise<PullResult> {
	const archive = await fetchWorkspaceArchive(serverUrl, token);
	return importArchiveToBackend(backend, archive);
}
