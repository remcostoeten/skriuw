import type { MoodLevel } from "@/domain/journal/models";
import type { RichTextDocument } from "@/domain/notes/models";
import type { NoteProperty } from "@/domain/notes/properties";

export type Brand<T, TBrand extends string> = T & { readonly __brand: TBrand };
export type Id<TName extends string> = Brand<string, `${TName}Id`>;

export type IsoTime = Brand<string, "IsoTime">;

export type DateKey = Brand<string, "DateKey">;

export type MarkdownContent = Brand<string, "MarkdownContent">;

export type TagName = Brand<string, "TagName">;

export type CssColorValue = Brand<string, "CssColorValue">;

export type NoteId = Id<"Note">;
export type FolderId = Id<"Folder">;
export type JournalEntryId = Id<"JournalEntry">;
export type TagId = Id<"Tag">;
export type Timestamps = {
	createdAt: IsoTime;
	updatedAt: IsoTime;
};

export type Entity<TId extends string = string> = {
	id: TId;
} & Timestamps;

export type PersistedNote = Entity<NoteId> & {
	name: string;
	content: MarkdownContent;
	richContent: RichTextDocument;
	preferredEditorMode: "raw" | "block";
	parentId: FolderId | null;
	sortOrder?: number;
	tags?: TagName[];
	properties?: NoteProperty[];
	icon?: string;
	cover?: string;
	journalMeta?: PersistedNoteJournalMetadata;
};

export type PersistedNoteJournalMetadata = {
	mood?: MoodLevel;
	tags: TagName[];
	weather?: string;
	location?: string;
};
