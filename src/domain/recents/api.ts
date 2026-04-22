"use server";

import { getAuthenticatedUser } from "@/core/supabase/server-client";
import type { RecentItem } from "@/features/notes/components/sidebar/types";

const MAX_RECENTS = 10;

type RecentRow = {
  item_id: string;
  item_type: "file" | "folder";
  accessed_at: string;
};

export async function listRecents(): Promise<RecentItem[]> {
  const { supabase, user } = await getAuthenticatedUser();

  const { data, error } = await supabase
    .from("user_recents")
    .select("item_id, item_type, accessed_at")
    .eq("user_id", user.id)
    .order("accessed_at", { ascending: false })
    .limit(MAX_RECENTS);

  if (error) throw error;

  return (data ?? []).map((row: RecentRow) => ({
    id: row.item_id,
    itemId: row.item_id,
    itemType: row.item_type,
    accessedAt: new Date(row.accessed_at),
  }));
}

export async function trackRecent(
  itemId: string,
  itemType: "file" | "folder",
): Promise<void> {
  const { supabase, user } = await getAuthenticatedUser();

  const { error } = await supabase.from("user_recents").upsert(
    {
      user_id: user.id,
      item_id: itemId,
      item_type: itemType,
      accessed_at: new Date().toISOString(),
    },
    { onConflict: "user_id,item_id" },
  );

  if (error) throw error;
}

export async function clearRecents(): Promise<void> {
  const { supabase, user } = await getAuthenticatedUser();

  const { error } = await supabase
    .from("user_recents")
    .delete()
    .eq("user_id", user.id);

  if (error) throw error;
}
