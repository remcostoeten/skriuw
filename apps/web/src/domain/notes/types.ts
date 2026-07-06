import type { FolderId, MarkdownContent, NoteId, TagName } from "@/domain/persistence/types";
import type { NoteEditorMode, RichTextDocument } from "@/domain/notes/models";
import type { NoteProperty } from "@/domain/notes/properties";

export type CreateNoteInput = {
	id?: NoteId;
	name: string;
	content: MarkdownContent;
	richContent?: RichTextDocument;
	preferredEditorMode?: NoteEditorMode;
	parentId?: FolderId | null;
	sortOrder?: number;
	tags?: TagName[];
	properties?: NoteProperty[];
	icon?: string;
	cover?: string;
	createdAt?: Date;
	updatedAt?: Date;
};

export type UpdateNoteInput = {
	id: NoteId;
	name?: string;
	content?: MarkdownContent;
	richContent?: RichTextDocument;
	preferredEditorMode?: NoteEditorMode;
	parentId?: FolderId | null;
	sortOrder?: number;
	tags?: TagName[];
	properties?: NoteProperty[];
	icon?: string;
	cover?: string;
	updatedAt?: Date;
};
