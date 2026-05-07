"use server";

import { getAuthenticatedUser } from "@/core/supabase/server-client";
import { fromPersistedNote } from "@/core/notes/mappers";
import { markdownToRichDocument } from "@/shared/lib/rich-document";
import type {
  FolderId,
  IsoTime,
  MarkdownContent,
  NoteId,
  TagName,
} from "@/core/shared/persistence-types";
import type { NoteFile, RichTextDocument } from "@/types/notes";
import type { MoodLevel } from "@/types/journal";

type NoteRow = {
  id: string;
  name: string;
  content: string;
  rich_content: RichTextDocument | null;
  preferred_editor_mode: "raw" | "block" | null;
  parent_id: string | null;
  tags?: string[] | null;
  journal_meta: {
    mood?: MoodLevel;
    tags: string[];
    weather?: string;
    location?: string;
  } | null;
  created_at: string;
  updated_at: string;
};

function rowToNoteFile(row: NoteRow): NoteFile {
  return fromPersistedNote({
    id: row.id as NoteId,
    name: row.name,
    content: row.content as MarkdownContent,
    richContent: row.rich_content ?? markdownToRichDocument(row.content),
    preferredEditorMode: row.preferred_editor_mode ?? "block",
    parentId: row.parent_id as FolderId | null,
    tags: row.tags?.map((tag) => tag as TagName),
    journalMeta: row.journal_meta
      ? {
          ...row.journal_meta,
          tags: row.journal_meta.tags.map((tag) => tag as TagName),
        }
      : undefined,
    createdAt: row.created_at as IsoTime,
    updatedAt: row.updated_at as IsoTime,
  });
}

export async function listNotes(): Promise<NoteFile[]> {
  const { supabase, user } = await getAuthenticatedUser();

  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row: NoteRow) => rowToNoteFile(row));
}

export type CreateNoteInput = {
  id?: string;
  name: string;
  content: string;
  richContent?: RichTextDocument;
  preferredEditorMode?: "raw" | "block";
  parentId?: string | null;
  tags?: string[];
};

export async function createNote(input: CreateNoteInput): Promise<NoteFile> {
  const { supabase, user } = await getAuthenticatedUser();
  const now = new Date().toISOString();
  const id = input.id ?? crypto.randomUUID();

  const row = {
    user_id: user.id,
    id,
    name: input.name.endsWith(".md") ? input.name : `${input.name}.md`,
    content: input.content,
    rich_content: input.richContent ?? markdownToRichDocument(input.content),
    preferred_editor_mode: input.preferredEditorMode ?? "block",
    parent_id: input.parentId ?? null,
    ...(input.tags ? { tags: input.tags } : {}),
    journal_meta: null,
    created_at: now,
    updated_at: now,
  };

  const { error } = await supabase
    .from("notes")
    .upsert([row], { onConflict: "user_id,id" });

  if (error) throw error;

  return rowToNoteFile(row as NoteRow);
}

export type UpdateNoteInput = {
  id: string;
  name?: string;
  content?: string;
  richContent?: RichTextDocument;
  preferredEditorMode?: "raw" | "block";
  parentId?: string | null;
  tags?: string[];
};

export async function updateNote(input: UpdateNoteInput): Promise<NoteFile | undefined> {
  const { supabase, user } = await getAuthenticatedUser();

  const { data: existing, error: fetchError } = await supabase
    .from("notes")
    .select("*")
    .eq("user_id", user.id)
    .eq("id", input.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!existing) return undefined;

  const updatedRow = {
    ...existing,
    name: input.name
      ? input.name.endsWith(".md") ? input.name : `${input.name}.md`
      : existing.name,
    content: input.content ?? existing.content,
    rich_content:
      input.richContent ??
      (input.content !== undefined
        ? markdownToRichDocument(input.content)
        : existing.rich_content),
    preferred_editor_mode: input.preferredEditorMode ?? existing.preferred_editor_mode,
    parent_id: input.parentId === undefined ? existing.parent_id : input.parentId,
    ...(input.tags ? { tags: input.tags } : {}),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("notes")
    .upsert([updatedRow], { onConflict: "user_id,id" });

  if (error) throw error;

  return rowToNoteFile(updatedRow as NoteRow);
}

export async function deleteNote(id: string): Promise<void> {
  const { supabase, user } = await getAuthenticatedUser();

  const { error } = await supabase
    .from("notes")
    .update({ deleted_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("id", id);

  if (error) throw error;
}
