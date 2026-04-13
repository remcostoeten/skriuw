"use client";

import { useEffect } from "react";
import { useJournalStore } from "@/features/journal/store";
import { useAuthSnapshot } from "@/platform/auth/use-auth";
import { useNotesStore } from "@/features/notes/store";
import { usePreferencesStore } from "@/features/settings/store";
import { ensurePrivacyDemoSeeded } from "@/core/persistence/repositories/privacy-demo";

export function PersistenceBootstrap() {
  const initializeNotes = useNotesStore((state) => state.initialize);
  const initializeJournal = useJournalStore((state) => state.initialize);
  const syncPreferencesActor = usePreferencesStore((state) => state.syncActor);
  const auth = useAuthSnapshot();

  useEffect(() => {
    if (!auth.isReady) {
      return;
    }

    void (async () => {
      if (auth.mode === "privacy") {
        await ensurePrivacyDemoSeeded();
      }

      await Promise.all([initializeNotes(), initializeJournal()]);
    })();
  }, [auth.isReady, auth.mode, initializeJournal, initializeNotes]);

  useEffect(() => {
    syncPreferencesActor(auth.actorId);
  }, [auth.actorId, syncPreferencesActor]);

  return null;
}
