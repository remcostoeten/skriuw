"use client";

import { useEffect } from "react";
import { useJournalStore } from "@/features/journal/store";
import { useNotesStore } from "@/store/notes-store";

export function PersistenceBootstrap() {
  const initializeNotes = useNotesStore((state) => state.initialize);
  const initializeJournal = useJournalStore((state) => state.initialize);

  useEffect(() => {
    void initializeNotes();
    void initializeJournal();
  }, [initializeJournal, initializeNotes]);

  return null;
}
