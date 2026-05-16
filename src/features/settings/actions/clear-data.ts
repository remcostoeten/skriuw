"use server";

import { getAuthenticatedUser } from "@/core/supabase/server-client";

const CLEAR_PHRASE = "clear my data";

// Content tables only — account, AI keys, and usage logs are intentionally excluded.
const CONTENT_TABLES = ["notes", "folders", "journal_entries", "tags", "user_recents"] as const;

export type ClearDataResult = { ok: true } | { ok: false; error: string };

export async function clearAllData(confirmation: string): Promise<ClearDataResult> {
  if (confirmation.trim().toLowerCase() !== CLEAR_PHRASE) {
    return { ok: false, error: "Confirmation did not match." };
  }

  const { supabase, user } = await getAuthenticatedUser().catch(() => ({
    supabase: null,
    user: null,
  }));

  if (!supabase || !user) {
    return { ok: false, error: "Not authenticated." };
  }

  const now = new Date().toISOString();

  for (const table of CONTENT_TABLES) {
    const { error } = await supabase
      .from(table)
      .update({ deleted_at: now })
      .eq("user_id", user.id)
      .is("deleted_at", null);

    if (error) return { ok: false, error: error.message };
  }

  return { ok: true };
}
