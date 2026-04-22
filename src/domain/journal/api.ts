"use server";

import { getAuthenticatedUser } from "@/core/supabase/server-client";
import type { JournalEntry, JournalTag, MoodLevel } from "@/types/journal";

type EntryRow = {
  id: string;
  date_key: string;
  content: string;
  mood: MoodLevel | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
};

type TagRow = {
  id: string;
  name: string;
  color: string;
  usage_count: number | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
};

function rowToEntry(row: EntryRow): JournalEntry {
  return {
    id: row.id,
    dateKey: row.date_key,
    content: row.content,
    tags: row.tags ?? [],
    mood: row.mood ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function rowToTag(row: TagRow): JournalTag {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    usageCount: row.usage_count ?? 0,
  };
}

// ── Journal Entries ──────────────────────────────────────────────────

export async function listJournalEntries(): Promise<JournalEntry[]> {
  const { supabase, user } = await getAuthenticatedUser();

  const { data, error } = await supabase
    .from("journal_entries")
    .select("*")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row: EntryRow) => rowToEntry(row));
}

export type CreateJournalEntryInput = {
  id?: string;
  dateKey: string;
  content: string;
  tags?: string[];
  mood?: MoodLevel;
};

export async function createJournalEntry(input: CreateJournalEntryInput): Promise<JournalEntry> {
  const { supabase, user } = await getAuthenticatedUser();
  const now = new Date().toISOString();
  const id = input.id ?? crypto.randomUUID();

  const row = {
    user_id: user.id,
    id,
    date_key: input.dateKey,
    content: input.content,
    mood: input.mood ?? null,
    tags: input.tags ?? [],
    created_at: now,
    updated_at: now,
  };

  const { error } = await supabase
    .from("journal_entries")
    .upsert([row], { onConflict: "user_id,id" });

  if (error) throw error;

  return rowToEntry(row as EntryRow);
}

export type UpdateJournalEntryInput = {
  id: string;
  content?: string;
  tags?: string[];
  mood?: MoodLevel | null;
};

export async function updateJournalEntry(
  input: UpdateJournalEntryInput,
): Promise<JournalEntry | undefined> {
  const { supabase, user } = await getAuthenticatedUser();

  const { data: existing, error: fetchError } = await supabase
    .from("journal_entries")
    .select("*")
    .eq("user_id", user.id)
    .eq("id", input.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!existing) return undefined;

  const updatedRow = {
    ...existing,
    content: input.content ?? existing.content,
    tags: input.tags ?? existing.tags,
    mood: input.mood === undefined ? existing.mood : input.mood,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("journal_entries")
    .upsert([updatedRow], { onConflict: "user_id,id" });

  if (error) throw error;

  return rowToEntry(updatedRow as EntryRow);
}

export async function deleteJournalEntry(id: string): Promise<void> {
  const { supabase, user } = await getAuthenticatedUser();

  const { error } = await supabase
    .from("journal_entries")
    .update({ deleted_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("id", id);

  if (error) throw error;
}

// ── Tags ─────────────────────────────────────────────────────────────

export async function listJournalTags(): Promise<JournalTag[]> {
  const { supabase, user } = await getAuthenticatedUser();

  const { data, error } = await supabase
    .from("tags")
    .select("*")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row: TagRow) => rowToTag(row));
}

export type CreateJournalTagInput = {
  name: string;
  color: string;
};

export async function createJournalTag(input: CreateJournalTagInput): Promise<JournalTag> {
  const { supabase, user } = await getAuthenticatedUser();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const row = {
    user_id: user.id,
    id,
    name: input.name,
    color: input.color,
    usage_count: 0,
    last_used_at: null,
    created_at: now,
    updated_at: now,
  };

  const { error } = await supabase
    .from("tags")
    .upsert([row], { onConflict: "user_id,id" });

  if (error) throw error;

  return rowToTag(row as TagRow);
}

export async function deleteJournalTag(id: string): Promise<void> {
  const { supabase, user } = await getAuthenticatedUser();

  // Find the tag to get its name for cleanup
  const { data: tag } = await supabase
    .from("tags")
    .select("name")
    .eq("user_id", user.id)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!tag) return;

  // Remove tag name from all journal entries that use it
  const { data: entries } = await supabase
    .from("journal_entries")
    .select("id, tags")
    .eq("user_id", user.id)
    .is("deleted_at", null);

  const now = new Date().toISOString();
  const entriesToUpdate = (entries ?? []).filter(
    (entry: { tags: string[] | null }) => entry.tags?.includes(tag.name),
  );

  for (const entry of entriesToUpdate) {
    await supabase
      .from("journal_entries")
      .update({
        tags: (entry.tags as string[]).filter((t: string) => t !== tag.name),
        updated_at: now,
      })
      .eq("user_id", user.id)
      .eq("id", entry.id);
  }

  // Soft-delete the tag
  const { error } = await supabase
    .from("tags")
    .update({ deleted_at: now })
    .eq("user_id", user.id)
    .eq("id", id);

  if (error) throw error;
}
