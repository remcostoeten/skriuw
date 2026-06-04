/**
 * Wire shape of a seed bundle. Stored in the `seed_bundles` row as four JSON
 * columns. Refs are stable string identifiers used to express folder->folder
 * and folder->note parent relationships within the bundle; they get remapped
 * to fresh UUIDs at seed time.
 *
 * `tags` and `journals` exist in the schema for forward-compatibility; the
 * v1 admin UI only writes `folders` and `notes`. Authoring for the other
 * two entity types is deferred.
 */

export type SeedFolder = {
	ref: string;
	name: string;
	parentRef: string | null;
	order: number;
};

export type SeedNote = {
	ref: string;
	name: string;
	parentRef: string | null;
	order: number;
	/** BlockNote block JSON. Stored as-is, never converted from markdown. */
	richContent: unknown[];
	/** Optional markdown mirror used for search, links, and tags when present. */
	content?: string;
	tags?: string[];
	preferredEditorMode?: "block" | "markdown";
};

export type SeedTag = {
	ref: string;
	name: string;
	color: string;
};

export type SeedJournalEntry = {
	ref: string;
	dateKey: string;
	content: string;
	mood?: string | null;
	tags?: string[];
};

export type SeedBundlePayload = {
	folders: SeedFolder[];
	notes: SeedNote[];
	tags: SeedTag[];
	journals: SeedJournalEntry[];
};

export type SeedBundleSummary = {
	id: string;
	name: string;
	isActive: boolean;
	updatedAt: Date;
	folderCount: number;
	noteCount: number;
};
