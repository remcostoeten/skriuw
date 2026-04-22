import type { NoteFile } from "@/types/notes";
import type {
  FolderId,
  IsoTime,
  MarkdownContent,
  NoteId,
  PersistedNote,
  TagName,
} from "@/core/shared/persistence-types";
import { markdownToRichDocument } from "@/shared/lib/rich-document";

function toIsoTime(date: Date): IsoTime {
  return date.toISOString() as IsoTime;
}

export function toPersistedNote(note: NoteFile): PersistedNote {
  const richContent = note.richContent ?? markdownToRichDocument(note.content);
  const preferredEditorMode = note.preferredEditorMode ?? "block";

  return {
    id: note.id as NoteId,
    name: note.name,
    content: note.content as MarkdownContent,
    richContent,
    preferredEditorMode,
    parentId: note.parentId as FolderId | null,
    createdAt: toIsoTime(note.createdAt),
    updatedAt: toIsoTime(note.modifiedAt),
    journalMeta: note.journalMeta
      ? {
          ...note.journalMeta,
          tags: note.journalMeta.tags.map((tag) => tag as TagName),
        }
      : undefined,
  };
}

export function fromPersistedNote(note: PersistedNote): NoteFile {
  const richContent = note.richContent ?? markdownToRichDocument(note.content);
  const preferredEditorMode = note.preferredEditorMode ?? "block";

  return {
    id: note.id,
    name: note.name,
    content: note.content,
    richContent,
    preferredEditorMode,
    parentId: note.parentId,
    createdAt: new Date(note.createdAt),
    modifiedAt: new Date(note.updatedAt),
    journalMeta: note.journalMeta
      ? {
          ...note.journalMeta,
          tags: note.journalMeta.tags.map((tag) => tag as string),
        }
      : undefined,
  };
}
