import type { FolderId, MarkdownContent, NoteId } from "@/core/shared/persistence-types";

export type CreateNoteInput = {
  id?: NoteId;
  name: string;
  content: MarkdownContent;
  parentId?: FolderId | null;
  createdAt?: Date;
  updatedAt?: Date;
};

export type UpdateNoteInput = {
  id: NoteId;
  name?: string;
  content?: MarkdownContent;
  parentId?: FolderId | null;
  updatedAt?: Date;
};
