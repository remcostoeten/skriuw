"use client";

import { useEffect } from "react";
import { useJournalStore } from "@/features/journal/store";
import { useAuthSnapshot } from "@/platform/auth/use-auth";
import { useNotesStore } from "@/features/notes/store";
import { usePreferencesStore } from "@/features/settings/store";
import { useDocumentStore } from "@/features/layout/store";
import { useSidebarStore } from "@/features/notes/components/sidebar/store";
import { ensurePrivacyDemoSeeded } from "@/core/persistence/repositories/privacy-demo";

export function PersistenceBootstrap() {
  const beginNotesActorTransition = useNotesStore((state) => state.beginActorTransition);
  const initializeNotes = useNotesStore((state) => state.initialize);
  const beginJournalActorTransition = useJournalStore((state) => state.beginActorTransition);
  const initializeJournal = useJournalStore((state) => state.initialize);
  const syncPreferencesActor = usePreferencesStore((state) => state.syncActor);
  const syncLayoutActor = useDocumentStore((state) => state.syncActor);
  const syncSidebarActor = useSidebarStore((state) => state.syncActor);
  const auth = useAuthSnapshot();

  useEffect(() => {
    if (!auth.isReady) {
      return;
    }

    const actorId = auth.actorId;
    let isCancelled = false;
    beginNotesActorTransition(actorId);
    beginJournalActorTransition(actorId);

    void (async () => {
      if (auth.status === "signed_out") {
        return;
      }

      if (auth.mode === "privacy") {
        await ensurePrivacyDemoSeeded(actorId);
      }

      if (isCancelled) {
        return;
      }

      await Promise.all([initializeNotes(actorId), initializeJournal(actorId)]);
    })();

    return () => {
      isCancelled = true;
    };
  }, [
    auth.actorId,
    auth.isReady,
    auth.mode,
    auth.status,
    beginJournalActorTransition,
    beginNotesActorTransition,
    initializeJournal,
    initializeNotes,
  ]);

  useEffect(() => {
    if (!auth.isReady) {
      return;
    }

    void Promise.all([syncLayoutActor(auth.actorId), syncSidebarActor(auth.actorId)]);
  }, [auth.actorId, auth.isReady, syncLayoutActor, syncSidebarActor]);

  useEffect(() => {
    if (auth.status === "signed_out") {
      return;
    }

    syncPreferencesActor(auth.actorId);
  }, [auth.actorId, auth.status, syncPreferencesActor]);

  return null;
}
