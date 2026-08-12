import type { PartialBlock } from "@blocknote/core";
import type { MoodLevel } from "@/domain/journal/models";
import type { NoteProperty } from "@/domain/notes/properties";

export type NoteEditorMode = "raw" | "block";

/**
 * A persisted note body, stored as JSONB.
 *
 * The schema parameters stay open because the document carries whatever
 * `editorSchema` produced — custom blocks (procode, diagram) and
 * custom inline content (noteLink, tag, person, mark) that BlockNote's default
 * schema types reject. Naming the concrete schema here would invert the layering
 * and make the domain depend on the editor feature.
 */
// biome-ignore lint/suspicious/noExplicitAny: schema-agnostic by construction; see above
export type RichTextDocument = PartialBlock<any, any, any>[];

/** A single block within a {@link RichTextDocument}. */
export type RichTextBlock = RichTextDocument[number];

export type NoteVersionReason = "created" | "autosave" | "checkpoint" | "rename" | "restore";

// The requesting user's role on a note. Absent on a NoteFile means the legacy
// owner-scoped path produced it (i.e. the viewer is the owner with full access).
export type NoteAccessRole = "owner" | "editor" | "viewer";

// Tag system for organizing notes
export type NoteTag = {
	id: string;
	name: string;
	color?: string;
	usageCount: number;
	createdAt: Date;
};

// Journal-specific metadata
export type JournalMetadata = {
	mood?: MoodLevel;
	tags: string[];
	weather?: string;
	location?: string;
};

/** A single note: its content, editor preferences, hierarchy position, and viewer access. */
export type NoteFile = {
	id: string;
	name: string;
	content: string;
	richContent: RichTextDocument;
	preferredEditorMode: NoteEditorMode;
	createdAt: Date;
	modifiedAt: Date;
	parentId: string | null;
	sortOrder?: number;
	tags?: string[];
	properties?: NoteProperty[];
	// Optional journal metadata
	icon?: string;
	cover?: string;
	// Serialized Excalidraw scene drawn over the whole note (annotate mode).
	annotationScene?: string;
	journalMeta?: JournalMetadata;
	// Set on the collaborator-aware read path. `ownerId` is the note's real owner;
	// `access` is this viewer's role. Undefined → owner (legacy owner-scoped read).
	ownerId?: string;
	access?: NoteAccessRole;
};

/** An immutable snapshot of a note captured for history, keyed by `contentHash`. */
export type NoteVersion = {
	id: string;
	noteId: string;
	name: string;
	content: string;
	richContent: RichTextDocument;
	preferredEditorMode: NoteEditorMode;
	createdAt: Date;
	parentId: string | null;
	tags?: string[];
	properties?: NoteProperty[];
	reason: NoteVersionReason;
	contentHash: string;
};

/** A folder node in the sidebar tree; groups notes and nested folders by `parentId`. */
export type NoteFolder = {
	id: string;
	name: string;
	parentId: string | null;
	sortOrder?: number;
	isOpen: boolean;
};

export type SidebarItem =
	| { type: "file"; data: NoteFile }
	| { type: "folder"; data: NoteFolder; children: SidebarItem[] };
