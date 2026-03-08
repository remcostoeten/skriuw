import { useCallback } from "react";
import { useDocumentStore } from "@/store/document-store";
import { NoteFile } from "@/types/notes";

/**
 * Hook for accessing and mutating a specific document.
 * Replaces scattered useState/useCallback patterns for document operations.
 */
export function useDocumentState(id: string | null) {
  const document = useDocumentStore((state) =>
    id ? state.documents.get(id) || null : null,
  );
  const metadata = useDocumentStore((state) =>
    id ? state.metadata.get(id) || null : null,
  );
  const updateDocument = useDocumentStore((state) => state.updateDocument);
  const updateMetadata = useDocumentStore((state) => state.updateMetadata);

  const updateContent = useCallback(
    (content: string) => {
      if (id) {
        updateDocument(id, { content, modifiedAt: new Date() } as Partial<NoteFile>);
      }
    },
    [id, updateDocument],
  );

  const rename = useCallback(
    (name: string) => {
      if (id) {
        const finalName = name.endsWith(".md") ? name : `${name}.md`;
        updateDocument(id, { name: finalName, modifiedAt: new Date() } as Partial<NoteFile>);
      }
    },
    [id, updateDocument],
  );

  const updateTags = useCallback(
    (tags: string[]) => {
      if (id) {
        updateMetadata(id, { tags });
      }
    },
    [id, updateMetadata],
  );

  return {
    document,
    metadata,
    updateContent,
    rename,
    updateTags,
  };
}

/**
 * Hook for the currently active document.
 */
export function useActiveDocument() {
  const activeDocumentId = useDocumentStore((state) => state.activeDocumentId);
  const activeDocument = useDocumentStore((state) => state.getActiveDocument());
  const setActiveDocument = useDocumentStore((state) => state.setActiveDocument);

  return {
    activeDocumentId,
    activeDocument,
    setActiveDocument,
  };
}
