"use client";

import { useEffect } from "react";
import { useAuthSnapshot } from "@/platform/auth/use-auth";
import { initializeAuth } from "@/platform/auth";
import { useNotesStore } from "@/features/notes/store";
import { usePreferencesStore } from "@/features/settings/store";
import { useSidebarStore } from "@/features/notes/components/sidebar/store";

export function PersistenceBootstrap() {
  const resetNotesWorkspace = useNotesStore((state) => state.resetWorkspace);
  const initializeNotes = useNotesStore((state) => state.initialize);
  const syncPreferencesWorkspace = usePreferencesStore((state) => state.syncWorkspace);
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
    let isCancelled = false;
    resetNotesWorkspace();

    void (async () => {
      if (!isAuthenticated) {
        return;
      }

      if (isCancelled) {
        return;
      }

      await initializeNotes(workspaceId);
    })();

    return () => {
      isCancelled = true;
    };
  }, [
    auth.phase,
    auth.workspaceId,
    auth.isReady,
    auth.user,
    initializeNotes,
    resetNotesWorkspace,
  ]);

  useEffect(() => {
    if (!auth.isReady || auth.phase !== "authenticated") {
      return;
    }

    void syncSidebarWorkspace(auth.workspaceId);
  }, [auth.isReady, auth.phase, auth.workspaceId, syncSidebarWorkspace]);

  useEffect(() => {
    if (!auth.isReady || auth.phase !== "authenticated") {
      return;
    }

    syncPreferencesWorkspace(auth.workspaceId);
  }, [auth.isReady, auth.phase, auth.workspaceId, syncPreferencesWorkspace]);

  return null;
}
