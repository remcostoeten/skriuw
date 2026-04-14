"use client";

import { useEffect, useState } from "react";
import { journalRepository, notesRepository } from "@/core/persistence/repositories";
import { useAuthSnapshot } from "@/platform/auth/use-auth";

export type ProfileSummary = {
  noteCount: number;
  journalEntryCount: number;
  isLoading: boolean;
  error: string | null;
};

const initialSummary: ProfileSummary = {
  noteCount: 0,
  journalEntryCount: 0,
  isLoading: true,
  error: null,
};

export function useProfileSummary() {
  const auth = useAuthSnapshot();
  const [summary, setSummary] = useState<ProfileSummary>(initialSummary);

  useEffect(() => {
    let cancelled = false;

    setSummary((current) => ({
      ...current,
      isLoading: true,
      error: null,
    }));

    void (async () => {
      try {
        const [notes, journalEntries] = await Promise.all([
          notesRepository.list(),
          journalRepository.listEntries(),
        ]);

        if (cancelled) {
          return;
        }

        setSummary({
          noteCount: notes.length,
          journalEntryCount: journalEntries.length,
          isLoading: false,
          error: null,
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setSummary({
          noteCount: 0,
          journalEntryCount: 0,
          isLoading: false,
          error: error instanceof Error ? error.message : "Unable to load profile data.",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [auth.mode, auth.status, auth.workspaceId]);

  return {
    auth,
    ...summary,
  };
}
