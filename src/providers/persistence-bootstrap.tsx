"use client";

import { useEffect } from "react";
import { initializeAuth } from "@/platform/auth";
import { useAuthSnapshot } from "@/platform/auth/use-auth";
import { useNotesStore } from "@/features/notes/store";
import { usePreferencesStore } from "@/features/settings/store";
import { useSidebarStore } from "@/features/notes/components/sidebar/store";

export function PersistenceBootstrap() {
  const auth = useAuthSnapshot();

  useEffect(() => {
    void initializeAuth();
  }, []);

  useEffect(() => {
    if (!auth.isReady) return;

    useNotesStore.getState().resetWorkspace();
    if (auth.phase !== "authenticated" || !auth.user) return;

    void useNotesStore.getState().initialize(auth.workspaceId);
    void useSidebarStore.getState().syncWorkspace(auth.workspaceId);
    usePreferencesStore.getState().syncWorkspace(auth.workspaceId);
  }, [auth.isReady, auth.phase, auth.workspaceId, auth.user]);

  return null;
}
