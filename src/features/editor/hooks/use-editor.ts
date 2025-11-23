import { BlockNoteEditor, Block } from "@blocknote/core";
import { useCreateBlockNote } from "@blocknote/react";
import { useEffect, useState, useRef, useCallback } from "react";

import { useNotes } from "@/features/notes";
import { useEditorConfig } from "./useEditorConfig";

import type { Note } from "@/features/notes";

type options = {
  noteId: string;
  autoSave?: boolean;
  autoSaveDelay?: number;
  readOnly?: boolean;
}

type props = {
  editor: BlockNoteEditor | null;
  note: Note | null;
  noteName: string;
  isLoading: boolean;
  setNoteName: (name: string) => void;
  handleSave: () => void;
  error: string | null;
}

export function editorLogic({
  noteId,
  autoSave = true,
  autoSaveDelay = 1000,
  readOnly = false,
}: options): props {
  const { getNote, updateNote } = useNotes();
  const { config: editorConfig } = useEditorConfig();
  const [note, setNote] = useState<Note | null>(null);
  const [noteName, setNoteName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout>();
  const hasInitializedRef = useRef(false);

  // Load note data
  useEffect(() => {
    const loadNote = async () => {
      if (!noteId) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        const noteData = await getNote(noteId);

        if (noteData) {
          setNote(noteData);
          setNoteName(noteData.name);
        } else {
          setError("Note not found");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load note");
      } finally {
        setIsLoading(false);
      }
    };

    loadNote();
  }, [noteId, getNote]);

  // Ensure initialContent is a non-empty array
  const getDefaultContent = (): Block[] => [
    {
      id: "1",
      type: "paragraph",
      props: {},
      content: [],
      children: [],
    } as Block,
  ];

  // Determine initial content based on current note
  const getInitialContent = (): Block[] => {
    if (note?.content && note.content.length > 0) {
      return note.content;
    }
    return getDefaultContent();
  };

  // Create editor instance using the official React hook
  // Key the editor creation to noteId to ensure fresh editor for each note
  const editor = useCreateBlockNote({
    initialContent: getInitialContent(),
    ...editorConfig,
  });

  // Update editor content when note changes (only if content differs)
  useEffect(() => {
    if (!editor || !note || readOnly || isLoading) return;

    // Only update if this is a new note (noteId changed)
    // We use a ref to track if we've initialized to avoid overwriting user edits
    if (!hasInitializedRef.current) {
      const contentToLoad = note.content && note.content.length > 0 
        ? note.content 
        : getDefaultContent();
      
      // Only replace if content is actually different
      const currentContent = editor.document;
      const contentMatches = JSON.stringify(currentContent) === JSON.stringify(contentToLoad);
      
      if (!contentMatches) {
        // Replace all blocks with the note content
        editor.replaceBlocks(editor.document, contentToLoad);
      }
      hasInitializedRef.current = true;
    }
  }, [note?.id, editor, readOnly, isLoading]);

  // Reset initialization flag when noteId changes
  useEffect(() => {
    hasInitializedRef.current = false;
  }, [noteId]);

  // Save function
  const handleSave = useCallback(() => {
    if (!editor || !noteId) return;

    try {
      const blocks = editor.document;
      updateNote(noteId, blocks, noteName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save note");
    }
  }, [editor, noteId, noteName, updateNote]);

  // Auto-save logic
  useEffect(() => {
    if (!editor || !noteId || isLoading || !autoSave || readOnly) return;

    const handleChange = () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        handleSave();
      }, autoSaveDelay);
    };

    editor.onEditorContentChange(handleChange);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [editor, noteId, noteName, isLoading, autoSave, autoSaveDelay, readOnly, handleSave]);

  return {
    editor: readOnly ? null : editor,
    note,
    noteName,
    isLoading,
    setNoteName,
    handleSave,
    error,
  };
}