'use client';

import { useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import type { NoteFile } from "@/types/notes";

export function useFileNavigation(files: NoteFile[], activeFileId: string | null) {
  const currentFileIndex = files.findIndex((file) => file.id === activeFileId);
  const canNavigatePrev = currentFileIndex > 0;
  const canNavigateNext = currentFileIndex < files.length - 1;

  const navigatePrev = useCallback((onFileSelect: (id: string) => void) => {
    if (canNavigatePrev) {
      const prevFile = files[currentFileIndex - 1];
      onFileSelect(prevFile.id);
      updateUrl(prevFile.id);
    }
  }, [canNavigatePrev, currentFileIndex, files]);

  const navigateNext = useCallback((onFileSelect: (id: string) => void) => {
    if (canNavigateNext) {
      const nextFile = files[currentFileIndex + 1];
      onFileSelect(nextFile.id);
      updateUrl(nextFile.id);
    }
  }, [canNavigateNext, currentFileIndex, files]);

  return {
    currentFileIndex,
    canNavigatePrev,
    canNavigateNext,
    navigatePrev,
    navigateNext,
  };
}

export function useUrlSync(onFileSelect: (id: string) => void) {
  const searchParams = useSearchParams();

  const syncWithUrl = useCallback((noteId: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('note', noteId);
    window.history.pushState({}, '', url.toString());
  }, []);

  const handleFileSelect = useCallback((id: string) => {
    onFileSelect(id);
    syncWithUrl(id);
  }, [onFileSelect, syncWithUrl]);

  useEffect(() => {
    const noteId = searchParams.get("note");
    if (noteId) {
      onFileSelect(noteId);
    }
  }, [searchParams, onFileSelect]);

  return { handleFileSelect, syncWithUrl };
}

function updateUrl(noteId: string) {
  const url = new URL(window.location.href);
  url.searchParams.set('note', noteId);
  window.history.pushState({}, '', url.toString());
}
