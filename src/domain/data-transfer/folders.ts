import type { ParsedNoteFile, SkriuwExportFolder } from "@/domain/data-transfer/types";

export function foldersFromNotePaths(notes: ParsedNoteFile[]): SkriuwExportFolder[] {
	const byPath = new Map<string, SkriuwExportFolder>();

	for (const note of notes) {
		if (!note.parentPath) continue;

		const segments = note.parentPath.split("/").filter(Boolean);
		let parentPath: string | null = null;
		let currentPath = "";

		for (const segment of segments) {
			currentPath = currentPath ? `${currentPath}/${segment}` : segment;
			if (byPath.has(currentPath)) {
				parentPath = currentPath;
				continue;
			}

			byPath.set(currentPath, {
				id: `path:${currentPath}`,
				name: segment,
				parentId: parentPath ? `path:${parentPath}` : null,
				sortOrder: 0,
			});
			parentPath = currentPath;
		}
	}

	return Array.from(byPath.values());
}

type FolderPathRow = Pick<SkriuwExportFolder, "id" | "name" | "parentId">;

export function exportFolderPaths(folders: FolderPathRow[]): Map<string, string> {
	const byId = new Map(folders.map((folder) => [folder.id, folder]));
	const cache = new Map<string, string>();
	const visiting = new Set<string>();

	function pathFor(id: string): string {
		if (cache.has(id)) return cache.get(id)!;
		if (visiting.has(id)) {
			throw new Error(`Folder cycle detected for id: ${id}`);
		}

		visiting.add(id);
		const folder = byId.get(id);
		if (!folder) {
			visiting.delete(id);
			return "";
		}

		const parentPath = folder.parentId ? pathFor(folder.parentId) : "";
		const path = parentPath ? `${parentPath}/${folder.name}` : folder.name;
		cache.set(id, path);
		visiting.delete(id);
		return path;
	}

	for (const folder of folders) pathFor(folder.id);
	return cache;
}

export function sortFoldersForCreation(folders: SkriuwExportFolder[]): SkriuwExportFolder[] {
	const paths = exportFolderPaths(folders);
	return [...folders].sort((left, right) => {
		const leftDepth = (paths.get(left.id) ?? "").split("/").filter(Boolean).length;
		const rightDepth = (paths.get(right.id) ?? "").split("/").filter(Boolean).length;
		return leftDepth - rightDepth;
	});
}
