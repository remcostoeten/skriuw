export const SKRIUW_EXPORT_SOURCE = "skriuw" as const;
export const SKRIUW_EXPORT_VERSION = 3 as const;

export type ImportPolicy = "merge" | "overwrite" | "replace-workspace";
export type ImportProfile = "skriuw" | "markdown-vault";

export const DEFAULT_IMPORT_POLICY: ImportPolicy = "merge";

export type SkriuwExportManifestV1 = {
	version: 1;
	source: typeof SKRIUW_EXPORT_SOURCE;
	exportedAt: string;
	counts: {
		notes: number;
		journalEntries: number;
	};
};

export type SkriuwExportFolder = {
	id: string;
	name: string;
	parentId: string | null;
	sortOrder: number;
};

export type SkriuwExportJournalTag = {
	name: string;
	color: string;
};

export type SkriuwExportManifestV2 = {
	version: 2;
	source: typeof SKRIUW_EXPORT_SOURCE;
	exportedAt: string;
	counts: {
		notes: number;
		journalEntries: number;
		folders: number;
		journalTags: number;
	};
	folders: SkriuwExportFolder[];
	journalTags: SkriuwExportJournalTag[];
};

export type SkriuwExportManifestV3 = {
	version: typeof SKRIUW_EXPORT_VERSION;
	source: typeof SKRIUW_EXPORT_SOURCE;
	exportedAt: string;
	options?: {
		includeVersions?: boolean;
	};
	counts: {
		notes: number;
		journalEntries: number;
		folders: number;
		journalTags: number;
		noteVersions: number;
	};
	folders: SkriuwExportFolder[];
	journalTags: SkriuwExportJournalTag[];
	checksums: Record<string, string>;
};

export type SkriuwExportManifest =
	| SkriuwExportManifestV1
	| SkriuwExportManifestV2
	| SkriuwExportManifestV3;

export type ParsedNoteFile = {
	id?: string;
	name: string;
	content: string;
	richContent?: unknown;
	tags: string[];
	parentPath: string | null;
	sortOrder?: number;
	preferredEditorMode?: "raw" | "block";
	createdAt?: string;
	updatedAt?: string;
	sourcePath: string;
};

export type ParsedJournalFile = {
	id?: string;
	dateKey: string;
	content: string;
	mood?: string;
	tags: string[];
	sourcePath: string;
};

export type ParsedNoteVersion = {
	id: string;
	noteId: string;
	name: string;
	content: string;
	richContent?: unknown;
	preferredEditorMode: "raw" | "block";
	parentId: string | null;
	tags: string[];
	reason: string;
	contentHash: string;
	createdAt: string;
	sourcePath: string;
};

export type ParsedArchive = {
	manifest: SkriuwExportManifest;
	notes: ParsedNoteFile[];
	journalEntries: ParsedJournalFile[];
	noteVersions: ParsedNoteVersion[];
	rootPrefix: string;
	profile: ImportProfile;
	integrityWarnings: string[];
};

export type ImportEntityCounts = {
	create: number;
	skip: number;
	overwrite: number;
};

export type ImportPreview = {
	policy: ImportPolicy;
	profile: ImportProfile;
	folders: ImportEntityCounts;
	notes: ImportEntityCounts;
	journalEntries: ImportEntityCounts;
	journalTags: ImportEntityCounts;
	noteVersions: ImportEntityCounts;
	warnings: string[];
	integrityWarnings: string[];
	replaceWorkspace?: {
		folders: number;
		notes: number;
		journalEntries: number;
		journalTags: number;
	};
	samples: {
		notesToCreate: string[];
		notesToOverwrite: string[];
		journalToCreate: string[];
		journalToOverwrite: string[];
	};
};

export type ImportMergeResult = ImportPreview & {
	ok: true;
};

export function isSkriuwManifestV2OrV3(
	manifest: SkriuwExportManifest,
): manifest is SkriuwExportManifestV2 | SkriuwExportManifestV3 {
	return manifest.version === 2 || manifest.version === 3;
}

export function parseImportPolicy(value: FormDataEntryValue | null): ImportPolicy {
	if (value === "overwrite" || value === "replace-workspace") return value;
	return DEFAULT_IMPORT_POLICY;
}

export function parseImportProfile(value: FormDataEntryValue | null): ImportProfile | undefined {
	if (value === "markdown-vault") return value;
	if (value === "skriuw") return value;
	return undefined;
}
