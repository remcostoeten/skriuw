export const SKRIUW_EXPORT_SOURCE = "skriuw" as const;
export const SKRIUW_EXPORT_VERSION = 2 as const;

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
	version: typeof SKRIUW_EXPORT_VERSION;
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

export type SkriuwExportManifest = SkriuwExportManifestV1 | SkriuwExportManifestV2;

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

export type ParsedArchive = {
	manifest: SkriuwExportManifest;
	notes: ParsedNoteFile[];
	journalEntries: ParsedJournalFile[];
	rootPrefix: string;
};

export type ImportEntityCounts = {
	create: number;
	skip: number;
	rename?: number;
};

export type ImportPreview = {
	folders: ImportEntityCounts;
	notes: ImportEntityCounts;
	journalEntries: ImportEntityCounts;
	journalTags: ImportEntityCounts;
	warnings: string[];
	samples: {
		notesToCreate: string[];
		journalToCreate: string[];
	};
};

export type ImportMergeResult = ImportPreview & {
	ok: true;
};
