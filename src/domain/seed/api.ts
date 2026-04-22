"use server";

import { createServerSupabaseClient } from "@/core/supabase/server-client";
import { markdownToRichDocument } from "@/shared/lib/rich-document";
import { buildWebStarterContent } from "@/core/shared/starter-content";

export async function ensureCloudStarterContentSeeded(userId: string): Promise<void> {
  const supabase = await createServerSupabaseClient();

  // Check if user already has any data
  const [{ data: existingNotes }, { data: existingFolders }] = await Promise.all([
    supabase
      .from("notes")
      .select("id")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .limit(1),
    supabase
      .from("folders")
      .select("id")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .limit(1),
  ]);

  if ((existingNotes?.length ?? 0) > 0 || (existingFolders?.length ?? 0) > 0) {
    return;
  }

  const starter = buildWebStarterContent();
  const now = new Date().toISOString();

  // Seed folders
  const folderRows = starter.folders.map((folder) => ({
    user_id: userId,
    id: folder.id,
    name: folder.name,
    parent_id: folder.parentId ?? null,
    created_at: folder.createdAt ?? now,
    updated_at: folder.updatedAt ?? now,
  }));

  // Seed notes
  const noteRows = starter.notes.map((note) => ({
    user_id: userId,
    id: note.id,
    name: note.name,
    content: note.content,
    rich_content: markdownToRichDocument(note.content),
    preferred_editor_mode: note.preferredEditorMode ?? "block",
    parent_id: note.parentId ?? null,
    journal_meta: note.journalMeta ?? null,
    created_at: note.createdAt ?? now,
    updated_at: note.updatedAt ?? now,
  }));

  // Seed tags
  const tagRows = starter.tags.map((tag) => ({
    user_id: userId,
    id: tag.id,
    name: tag.name,
    color: tag.color,
    usage_count: tag.usageCount ?? 0,
    last_used_at: tag.lastUsedAt ?? null,
    created_at: tag.createdAt ?? now,
    updated_at: tag.updatedAt ?? now,
  }));

  // Seed journal entries
  const entryRows = starter.journalEntries.map((entry) => ({
    user_id: userId,
    id: entry.id,
    date_key: entry.dateKey,
    content: entry.content,
    mood: entry.mood ?? null,
    tags: entry.tags ?? [],
    created_at: entry.createdAt ?? now,
    updated_at: entry.updatedAt ?? now,
  }));

  await Promise.all([
    folderRows.length > 0
      ? supabase.from("folders").upsert(folderRows, { onConflict: "user_id,id" })
      : Promise.resolve(),
    noteRows.length > 0
      ? supabase.from("notes").upsert(noteRows, { onConflict: "user_id,id" })
      : Promise.resolve(),
    tagRows.length > 0
      ? supabase.from("tags").upsert(tagRows, { onConflict: "user_id,id" })
      : Promise.resolve(),
    entryRows.length > 0
      ? supabase.from("journal_entries").upsert(entryRows, { onConflict: "user_id,id" })
      : Promise.resolve(),
  ]);
}
