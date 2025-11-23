import { BlockNoteEditor, Block } from "@blocknote/core";
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
  const [editor, setEditor] = useState<BlockNoteEditor | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [noteName, setNoteName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout>();

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

  // Track previous editor to preserve content when recreating
  const previousEditorRef = useRef<BlockNoteEditor | null>(null);

  // Initialize editor
  useEffect(() => {
    if (!note || readOnly) return;

    // Preserve current editor content if editor already exists and is being reconfigured
    const currentContent = previousEditorRef.current?.document || null;

    // Ensure initialContent is a non-empty array
    const defaultContent: Block[] = [
      {
        id: "1",
        type: "paragraph",
        props: {},
        content: [],
        children: [],
      } as Block,
    ];

    const initialContent = currentContent && currentContent.length > 0
      ? currentContent
      : (note.content && note.content.length > 0 
        ? note.content 
        : defaultContent);

    // Cleanup existing editor before creating new one
    if (previousEditorRef.current?._tiptapEditor) {
      previousEditorRef.current._tiptapEditor.destroy();
    }

    // Create editor with configuration from settings
    const newEditor = BlockNoteEditor.create({
      initialContent,
      ...editorConfig,
    });

    previousEditorRef.current = newEditor;
    setEditor(newEditor);

    return () => {
      // Cleanup editor instance
      if (newEditor._tiptapEditor) {
        newEditor._tiptapEditor.destroy();
      }
    };
  }, [note?.id, readOnly, editorConfig]);

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
    editor,
    note,
    noteName,
    isLoading,
    setNoteName,
    handleSave,
    error,
  };
}