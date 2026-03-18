"use client";

import { useEffect } from "react";
import { useJournalStore } from "@/features/journal/store";
import {
  detectLocalPersistenceDurability,
  resolveLocalPersistenceBackend,
} from "@/core/persistence/repositories";
import { pushAllToRemote } from "@/core/persistence/supabase";
import { initializeAuth } from "@/modules/auth";
import { useAuthSnapshot } from "@/modules/auth/use-auth";
import { useNotesStore } from "@/store/notes-store";
import { usePreferencesStore } from "@/store/preferences-store";

const EPHEMERAL_WARNING_KEY = "haptic:persistence-ephemeral-warning:v1";

export function PersistenceBootstrap() {
  const initializeNotes = useNotesStore((state) => state.initialize);
  const initializeJournal = useJournalStore((state) => state.initialize);
  const syncPreferencesActor = usePreferencesStore((state) => state.syncActor);
  const auth = useAuthSnapshot();

  useEffect(() => {
    const runBootstrap = async () => {
      const authPromise = initializeAuth();
      void resolveLocalPersistenceBackend();

      const durability = await detectLocalPersistenceDurability();
      if (durability === "ephemeral" && typeof window !== "undefined") {
        const alreadyWarned = window.sessionStorage.getItem(EPHEMERAL_WARNING_KEY) === "1";

        if (!alreadyWarned) {
          window.sessionStorage.setItem(EPHEMERAL_WARNING_KEY, "1");
          console.warn(
            "Local persistence appears ephemeral (likely private/incognito mode). Data can be cleared when this browsing session ends.",
          );
          window.alert(
            "Private/incognito mode may clear your local notes when the session ends. Use a normal browser window for durable local storage.",
          );
        }
      }

      await Promise.all([initializeNotes(), initializeJournal()]);
      await authPromise;

      // After local data is initialized, push to Supabase in the background
      const backend = await resolveLocalPersistenceBackend();
      if (backend === "pglite") {
        pushAllToRemote().catch((error) => {
          console.warn("[sync] Initial push to remote failed (non-blocking):", error);
        });
      }
    };

    void runBootstrap();
  }, [initializeJournal, initializeNotes]);

  useEffect(() => {
    syncPreferencesActor(auth.actorId);
  }, [auth.actorId, syncPreferencesActor]);

  useEffect(() => {
    if (!auth.canSync) {
      return;
    }

    const syncInBackground = () => {
      pushAllToRemote().catch((error) => {
        console.warn("[sync] Remote push failed (non-blocking):", error);
      });
    };

    syncInBackground();

    const handleOnline = () => {
      syncInBackground();
    };

    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("online", handleOnline);
    };
  }, [auth.canSync, auth.user?.id]);

  return null;
}
