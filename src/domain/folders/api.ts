"use server";

import { getAuthenticatedUser } from "@/core/supabase/server-client";
import type { FolderId, IsoTime } from "@/core/shared/persistence-types";
import type { NoteFolder } from "@/types/notes";

type FolderRow = {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
};

function rowToFolder(row: FolderRow): NoteFolder {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
    isOpen: false,
  };
}

export async function listFolders(): Promise<NoteFolder[]> {
  const { supabase, user } = await getAuthenticatedUser();

  const { data, error } = await supabase
    .from("folders")
    .select("*")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row: FolderRow) => rowToFolder(row));
}

export type CreateFolderInput = {
  id?: string;
  name: string;
  parentId?: string | null;
};

export async function createFolder(input: CreateFolderInput): Promise<NoteFolder> {
  const { supabase, user } = await getAuthenticatedUser();
  const now = new Date().toISOString();
  const id = input.id ?? crypto.randomUUID();

  const row = {
    user_id: user.id,
    id,
    name: input.name,
    parent_id: input.parentId ?? null,
    created_at: now,
    updated_at: now,
  };

  const { error } = await supabase
    .from("folders")
    .upsert([row], { onConflict: "user_id,id" });

  if (error) throw error;

  return rowToFolder(row);
}

export type UpdateFolderInput = {
  id: string;
  name?: string;
  parentId?: string | null;
};

export async function updateFolder(input: UpdateFolderInput): Promise<NoteFolder | undefined> {
  const { supabase, user } = await getAuthenticatedUser();

  const { data: existing, error: fetchError } = await supabase
    .from("folders")
    .select("*")
    .eq("user_id", user.id)
    .eq("id", input.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!existing) return undefined;

  const updatedRow = {
    ...existing,
    name: input.name ?? existing.name,
    parent_id: input.parentId === undefined ? existing.parent_id : input.parentId,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("folders")
    .upsert([updatedRow], { onConflict: "user_id,id" });

  if (error) throw error;

  return rowToFolder(updatedRow);
}

export async function deleteFolder(id: string): Promise<void> {
  const { supabase, user } = await getAuthenticatedUser();

  // Collect all descendant folder IDs
  const { data: allFolders } = await supabase
    .from("folders")
    .select("id, parent_id")
    .eq("user_id", user.id)
    .is("deleted_at", null);

  const descendants = new Set<string>([id]);
  const stack = [id];

  while (stack.length > 0) {
    const current = stack.pop();
    for (const folder of allFolders ?? []) {
      if (folder.parent_id === current && !descendants.has(folder.id)) {
        descendants.add(folder.id);
        stack.push(folder.id);
      }
    }
  }

  // Find notes inside any of those folders
  const { data: notes } = await supabase
    .from("notes")
    .select("id, parent_id")
    .eq("user_id", user.id)
    .is("deleted_at", null);

  const noteIdsToDelete = (notes ?? [])
    .filter((note: { parent_id: string | null }) => note.parent_id && descendants.has(note.parent_id))
    .map((note: { id: string }) => note.id);

  const now = new Date().toISOString();

  // Soft-delete folders and their notes
  const folderIds = Array.from(descendants);
  if (folderIds.length > 0) {
    await supabase
      .from("folders")
      .update({ deleted_at: now })
      .eq("user_id", user.id)
      .in("id", folderIds);
  }

  if (noteIdsToDelete.length > 0) {
    await supabase
      .from("notes")
      .update({ deleted_at: now })
      .eq("user_id", user.id)
      .in("id", noteIdsToDelete);
  }
}
