"use client";

import { useAuthSnapshot } from "@/platform/auth/use-auth";
import { useApiQuery } from "@/core/api";
import { listNotes } from "@/domain/notes/api";
import { listJournalEntries } from "@/domain/journal/api";

type ProfileSummary = {
  noteCount: number;
  journalEntryCount: number;
  isLoading: boolean;
  error: string | null;
};

export function useProfileSummary() {
  const auth = useAuthSnapshot();
  const isAuthenticated = auth.isReady && auth.phase === "authenticated";

  const notesQuery = useApiQuery(
    ["profile", "notes"],
    () => listNotes(),
    { enabled: isAuthenticated },
  );

  const journalQuery = useApiQuery(
    ["profile", "journal"],
    () => listJournalEntries(),
    { enabled: isAuthenticated },
  );

  const summary: ProfileSummary = {
    noteCount: notesQuery.data?.length ?? 0,
    journalEntryCount: journalQuery.data?.length ?? 0,
    isLoading: notesQuery.isLoading || journalQuery.isLoading,
    error: notesQuery.error?.message ?? journalQuery.error?.message ?? null,
  };

  return {
    auth,
    ...summary,
  };
}
