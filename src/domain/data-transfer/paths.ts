export function safeArchiveName(name: string): string {
	const sanitized = name.replace(/[/\\:*?"<>|]/g, "-").trim();
	return sanitized || "untitled";
}

export function uniqueArchivePath(files: Record<string, Uint8Array>, desired: string): string {
	if (!(desired in files)) return desired;
	const dot = desired.lastIndexOf(".");
	const base = dot !== -1 ? desired.slice(0, dot) : desired;
	const ext = dot !== -1 ? desired.slice(dot) : "";
	let index = 2;
	while (`${base}-${index}${ext}` in files) index++;
	return `${base}-${index}${ext}`;
}

export function normalizeNoteFileName(name: string): string {
	return name.endsWith(".md") ? name : `${name}.md`;
}

export function notePathFromArchivePath(
	rootPrefix: string,
	archivePath: string,
): { parentPath: string | null; name: string } | null {
	const notesPrefix = `${rootPrefix}/notes/`;
	if (!archivePath.startsWith(notesPrefix) || !archivePath.endsWith(".md")) {
		return null;
	}

	const relative = archivePath.slice(notesPrefix.length);
	const parts = relative.split("/").filter(Boolean);
	if (parts.length === 0) return null;

	const name = parts.at(-1)!;
	if (parts.length === 1) {
		return { parentPath: null, name };
	}

	return {
		parentPath: parts.slice(0, -1).join("/"),
		name,
	};
}

export function journalDateFromArchivePath(
	rootPrefix: string,
	archivePath: string,
): string | null {
	const journalPrefix = `${rootPrefix}/journal/`;
	if (!archivePath.startsWith(journalPrefix) || !archivePath.endsWith(".md")) {
		return null;
	}

	const dateKey = archivePath.slice(journalPrefix.length, -3);
	return /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? dateKey : null;
}

export function noteRichSidecarPath(noteMarkdownPath: string): string {
	return noteMarkdownPath.replace(/\.md$/, ".rich.json");
}

export function isNoteRichSidecarPath(rootPrefix: string, archivePath: string): boolean {
	return (
		archivePath.startsWith(`${rootPrefix}/notes/`) && archivePath.endsWith(".rich.json")
	);
}

export function findExportRootPrefix(paths: string[]): string | null {
	const manifestPath = paths.find((path) => path.endsWith("/skriuw-export.json"));
	if (manifestPath) {
		return manifestPath.slice(0, -"/skriuw-export.json".length);
	}

	const datedRoot = paths.find((path) => /^skriuw-export-\d{4}-\d{2}-\d{2}\//.test(path));
	if (datedRoot) {
		return datedRoot.split("/")[0] ?? null;
	}

	return null;
}
