import {
	defaultSkipMarkdownPath,
	parseMarkdownNoteFile,
} from "@/domain/data-transfer/adapters/markdown-import-shared";
import {
	parseTagsField,
	parseYamlString,
	splitFrontmatter,
} from "@/domain/data-transfer/frontmatter";
import type {
	ParsedArchive,
	ParsedJournalFile,
	ParsedNoteFile,
	SkriuwExportFolder,
	SkriuwExportJournalTag,
	SkriuwExportManifestV2,
} from "@/domain/data-transfer/types";

const SNAPSHOT_MANIFEST_FILE = "manifest.json";
const SNAPSHOT_VAULT_PREFIX = "vault/";
const JOURNAL_PREFIX = ".skriuw/journal/";
const FOLDERS_FILE = ".skriuw/folders.json";
const JOURNAL_TAGS_FILE = ".skriuw/journal-tags.json";

type SnapshotManifest = {
	version?: number;
	appDataDir?: string;
	appLocalDataDir?: string;
	vaultRoot?: string;
};

export function isDesktopSnapshotArchive(entries: Record<string, string>): boolean {
	const raw = entries[SNAPSHOT_MANIFEST_FILE];
	if (!raw) return false;
	try {
		const manifest = JSON.parse(raw) as SnapshotManifest;
		return (
			typeof manifest.vaultRoot === "string" &&
			typeof manifest.appDataDir === "string" &&
			typeof manifest.appLocalDataDir === "string"
		);
	} catch {
		return false;
	}
}

function parseJournalEntry(path: string, raw: string): ParsedJournalFile | null {
	const { frontmatter, body } = splitFrontmatter(raw);
	const dateKey = parseYamlString(String(frontmatter.dateKey ?? "")) ?? "";
	if (!dateKey) return null;

	const moodRaw = frontmatter.mood;
	return {
		id: String(frontmatter.id ?? ""),
		dateKey,
		content: body,
		mood: parseYamlString(moodRaw != null ? String(moodRaw) : undefined),
		tags: parseTagsField(frontmatter.tags),
		sourcePath: path,
	};
}

function parseFoldersFile(raw: string | undefined): SkriuwExportFolder[] {
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw) as Array<{
			id?: string;
			name?: string;
			parentId?: string | null;
			sortOrder?: number;
		}>;
		if (!Array.isArray(parsed)) return [];
		return parsed.flatMap((folder) =>
			typeof folder?.id === "string" && typeof folder?.name === "string"
				? [
						{
							id: folder.id,
							name: folder.name,
							parentId: typeof folder.parentId === "string" ? folder.parentId : null,
							sortOrder: typeof folder.sortOrder === "number" ? folder.sortOrder : 0,
						},
					]
				: [],
		);
	} catch {
		return [];
	}
}

function parseJournalTagsFile(raw: string | undefined): SkriuwExportJournalTag[] {
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw) as Array<{ name?: string; color?: string }>;
		if (!Array.isArray(parsed)) return [];
		return parsed.flatMap((tag) =>
			typeof tag?.name === "string" ? [{ name: tag.name, color: tag.color ?? "" }] : [],
		);
	} catch {
		return [];
	}
}

/** Imports the snapshot's `vault/`: notes, journal entries (`.skriuw/journal/`), folders, and journal tags. `app-data`/`app-local-data` are desktop-only app state (settings, AI keys, search index) with no web equivalent. */
export function parseDesktopSnapshotEntries(entries: Record<string, string>): ParsedArchive {
	const notes: ParsedNoteFile[] = [];
	const journalEntries: ParsedJournalFile[] = [];
	let foldersRaw: string | undefined;
	let journalTagsRaw: string | undefined;

	for (const [path, raw] of Object.entries(entries)) {
		if (!path.startsWith(SNAPSHOT_VAULT_PREFIX)) continue;
		const vaultPath = path.slice(SNAPSHOT_VAULT_PREFIX.length);

		if (vaultPath === FOLDERS_FILE) {
			foldersRaw = raw;
			continue;
		}
		if (vaultPath === JOURNAL_TAGS_FILE) {
			journalTagsRaw = raw;
			continue;
		}
		if (vaultPath.startsWith(JOURNAL_PREFIX) && vaultPath.endsWith(".md")) {
			const entry = parseJournalEntry(path, raw);
			if (entry) journalEntries.push(entry);
			continue;
		}
		if (vaultPath.endsWith(".md") && !defaultSkipMarkdownPath(vaultPath)) {
			notes.push(parseMarkdownNoteFile(vaultPath, raw));
		}
	}

	if (notes.length === 0 && journalEntries.length === 0) {
		throw new Error("No notes or journal entries found in this desktop snapshot.");
	}

	const folders = parseFoldersFile(foldersRaw);
	const journalTags = parseJournalTagsFile(journalTagsRaw);

	const manifest: SkriuwExportManifestV2 = {
		version: 2,
		source: "skriuw",
		exportedAt: new Date().toISOString(),
		counts: {
			notes: notes.length,
			journalEntries: journalEntries.length,
			folders: folders.length,
			journalTags: journalTags.length,
		},
		folders,
		journalTags,
	};

	return {
		manifest,
		notes,
		journalEntries,
		noteVersions: [],
		rootPrefix: "",
		profile: "desktop-snapshot",
		integrityWarnings: [
			"Imported from a desktop snapshot's vault: notes, folders, journal entries, and journal tags.",
			"App settings, AI keys, and the local search index were not included — they only apply to the desktop app.",
		],
	};
}
