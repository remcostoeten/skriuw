import type { NoteFile } from "@/types/notes";
import { markdownToRichDocument } from "@/shared/lib/rich-document";
import { fromPersistedNote } from "./mappers";
import { readNoteRecord, writeNoteRecord } from "./persistence";
import type { UpdateNoteInput } from "./types";

export async function updateNote(input: UpdateNoteInput): Promise<NoteFile | undefined> {
  const existing = await readNoteRecord(input.id);
  if (!existing) {
    return undefined;
  }

  const updated = await writeNoteRecord({
    ...existing,
    name: input.name
      ? input.name.endsWith(".md")
        ? input.name
        : `${input.name}.md`
      : existing.name,
    content: input.content ?? existing.content,
    richContent:
      input.richContent ??
      (input.content !== undefined
        ? markdownToRichDocument(input.content as string)
        : existing.richContent),
    preferredEditorMode: input.preferredEditorMode ?? existing.preferredEditorMode,
    parentId: input.parentId === undefined ? existing.parentId : input.parentId,
    updatedAt: (input.updatedAt ?? new Date()).toISOString() as typeof existing.updatedAt,
  });

  return fromPersistedNote(updated);
}
