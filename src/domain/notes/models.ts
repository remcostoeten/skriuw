import type { PartialBlock } from "@blocknote/core";
import type { MoodLevel } from "@/domain/journal/models";

export type NoteEditorMode = "raw" | "block";
export type RichTextDocument = PartialBlock[];

export type NoteVersionReason = "created" | "autosave" | "rename" | "restore";

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

export interface NoteFile {
	id: string;
	name: string;
	content: string;
	richContent: RichTextDocument;
	preferredEditorMode: NoteEditorMode;
	createdAt: Date;
	modifiedAt: Date;
	parentId: string | null;
	tags?: string[];
	// Optional journal metadata
	journalMeta?: JournalMetadata;
}

export interface NoteVersion {
	id: string;
	noteId: string;
	name: string;
	content: string;
	richContent: RichTextDocument;
	preferredEditorMode: NoteEditorMode;
	createdAt: Date;
	parentId: string | null;
	tags?: string[];
	reason: NoteVersionReason;
	contentHash: string;
}

export interface NoteFolder {
	id: string;
	name: string;
	parentId: string | null;
	isOpen: boolean;
}

export type SidebarItem =
	| { type: "file"; data: NoteFile }
	| { type: "folder"; data: NoteFolder; children: SidebarItem[] };
