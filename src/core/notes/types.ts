import type { FolderId, MarkdownContent, NoteId } from "@/core/shared/persistence-types";
import type { NoteEditorMode, RichTextDocument } from "@/types/notes";

export type CreateNoteInput = {
  id?: NoteId;
  name: string;
  content: MarkdownContent;
  richContent?: RichTextDocument;
  preferredEditorMode?: NoteEditorMode;
  parentId?: FolderId | null;
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
  updatedAt?: Date;
};
