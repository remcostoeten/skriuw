"use client";

import { useEffect } from "react";
import { useAuthSnapshot } from "@/platform/auth/use-auth";
import { initializeAuth } from "@/platform/auth";
import { useNotesStore } from "@/features/notes/store";
import { usePreferencesStore } from "@/features/settings/store";
import { useSidebarStore } from "@/features/notes/components/sidebar/store";
import { ensureCloudStarterContentSeeded } from "@/domain/seed/api";

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
    const authenticatedUserId = auth.user?.id ?? null;
    let isCancelled = false;
    resetNotesWorkspace();

    void (async () => {
      if (!isAuthenticated || !authenticatedUserId) {
        return;
      }

      await ensureCloudStarterContentSeeded(authenticatedUserId);

      if (isCancelled) {
        return;
      }

      await Promise.all([initializeNotes(workspaceId)]);
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

    void Promise.all([
      syncSidebarWorkspace(auth.workspaceId),
    ]);
  }, [auth.isReady, auth.phase, auth.workspaceId, syncSidebarWorkspace]);

  useEffect(() => {
    if (!auth.isReady || auth.phase !== "authenticated") {
      return;
    }

    syncPreferencesWorkspace(auth.workspaceId);
  }, [auth.isReady, auth.phase, auth.workspaceId, syncPreferencesWorkspace]);

  return null;
}
