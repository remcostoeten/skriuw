"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { NoteFile } from "@/types/notes";

type NoteLinkContextValue = {
  files: NoteFile[];
  activeFileId?: string;
};

const NoteLinkContext = createContext<NoteLinkContextValue>({ files: [] });

interface NoteLinkProviderProps extends NoteLinkContextValue {
  children: ReactNode;
}

export function NoteLinkProvider({ files, activeFileId, children }: NoteLinkProviderProps) {
  return (
    <NoteLinkContext.Provider value={{ files, activeFileId }}>{children}</NoteLinkContext.Provider>
  );
}

export function useNoteLinkContext() {
  return useContext(NoteLinkContext);
}
