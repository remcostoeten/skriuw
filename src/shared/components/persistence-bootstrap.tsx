"use client";

import { useEffect } from "react";
import { useJournalStore } from "@/features/journal/store";
import { useNotesStore } from "@/store/notes-store";
import { useWorkspaceStore } from "@/modules/workspace";

export function PersistenceBootstrap() {
  const initializeNotes = useNotesStore((state) => state.initialize);
  const initializeJournal = useJournalStore((state) => state.initialize);
  const activeWorkspaceId = useWorkspaceStore((state) => state.config.activeWorkspaceId);

  useEffect(() => {
    void initializeNotes();
    void initializeJournal();
  }, [initializeJournal, initializeNotes]);

  // Re-initialize when workspace changes (future: load workspace-specific data)
  useEffect(() => {
    // Currently all workspaces share data.
    // Future: Load workspace-specific notes when switching workspaces
  }, [activeWorkspaceId]);

  return null;
}
