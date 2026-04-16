"use client";

import { useEffect } from "react";
import { useJournalStore } from "@/features/journal/store";
import { useAuthSnapshot } from "@/platform/auth/use-auth";
import { initializeAuth } from "@/platform/auth";
import { useNotesStore } from "@/features/notes/store";
import { usePreferencesStore } from "@/features/settings/store";
import { useDocumentStore } from "@/features/layout/store";
import { useSidebarStore } from "@/features/notes/components/sidebar/store";
import {
  ensureCloudStarterContentSeeded,
  ensurePrivacyDemoSeeded,
} from "@/core/persistence/repositories/privacy-demo";

export function PersistenceBootstrap() {
  const resetNotesWorkspace = useNotesStore((state) => state.resetWorkspace);
  const initializeNotes = useNotesStore((state) => state.initialize);
  const resetJournalWorkspace = useJournalStore((state) => state.resetWorkspace);
  const initializeJournal = useJournalStore((state) => state.initialize);
  const syncPreferencesWorkspace = usePreferencesStore((state) => state.syncWorkspace);
  const syncLayoutWorkspace = useDocumentStore((state) => state.syncWorkspace);
  const syncSidebarWorkspace = useSidebarStore((state) => state.syncWorkspace);
  const auth = useAuthSnapshot();

  useEffect(() => {
    void initializeAuth();
  }, []);

  useEffect(() => {
    if (!auth.isReady) {
      return;
    }

    const workspaceId = auth.workspaceId;
    const isAuthenticated = auth.phase === "authenticated" && auth.user !== null;
    const authenticatedUserId = auth.user?.id ?? null;
    let isCancelled = false;
    resetNotesWorkspace();
    resetJournalWorkspace();

    void (async () => {
      if (isAuthenticated && authenticatedUserId) {
        await ensureCloudStarterContentSeeded(authenticatedUserId);
      } else {
        await ensurePrivacyDemoSeeded(workspaceId);
      }

      if (isCancelled) {
        return;
      }

      await Promise.all([initializeNotes(workspaceId), initializeJournal(workspaceId)]);
    })();

    return () => {
      isCancelled = true;
    };
  }, [
    auth.phase,
    auth.workspaceId,
    auth.isReady,
    auth.user,
    initializeJournal,
    initializeNotes,
    resetJournalWorkspace,
    resetNotesWorkspace,
  ]);

  useEffect(() => {
    if (!auth.isReady) {
      return;
    }

    void Promise.all([
      syncLayoutWorkspace(auth.workspaceId),
      syncSidebarWorkspace(auth.workspaceId),
    ]);
  }, [auth.isReady, auth.workspaceId, syncLayoutWorkspace, syncSidebarWorkspace]);

  useEffect(() => {
    if (!auth.isReady) {
      return;
    }

    syncPreferencesWorkspace(auth.workspaceId);
  }, [auth.isReady, auth.workspaceId, syncPreferencesWorkspace]);

  return null;
}
