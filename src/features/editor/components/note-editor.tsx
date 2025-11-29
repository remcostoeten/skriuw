import { AlertCircle } from "lucide-react";
import { useRef, useEffect } from "react";
import { useLocation } from "react-router-dom";

import { EmptyState } from "@/shared/ui/empty-state";

import { useShortcut } from "@/features/shortcuts/use-shortcut";

import { useEditor } from "../hooks/use-editor";

import { EditorWrapper, EditorWrapperHandle } from "./editor-wrapper";

type props = {
  noteId: string;
  className?: string;
  autoSave?: boolean;
  autoSaveDelay?: number;
  showHeader?: boolean
}

export function NoteEditor({
  noteId,
  className = "",
  showHeader = true,
  autoSave = true,
  autoSaveDelay = 1000,
}: props) {
  const {
    editor,
    note,
    isLoading,
    error,
  } = useEditor({
    noteId,
    autoSave,
    autoSaveDelay,
  });


  const editorRef = useRef<EditorWrapperHandle | null>(null);
  const location = useLocation();
  const hasFocusedRef = useRef(false);
  
  useShortcut('editor-focus', (event: KeyboardEvent) => {
    event.preventDefault();
    editorRef.current?.focusEditor();
  });

  // Reset focus ref when noteId changes
  useEffect(() => {
    hasFocusedRef.current = false;
  }, [noteId]);

  // Focus editor when note is newly created (empty content or heading template) or when navigating with ?focus=true
  useEffect(() => {
    if (editor && note && !hasFocusedRef.current) {
      // Check if note is empty or has a single empty paragraph
      const isEmptyParagraph = note.content.length === 1 && 
                               note.content[0].type === "paragraph" && 
                               (!note.content[0].content || note.content[0].content.length === 0);
      
      // Check if note starts with an empty heading (h1 or h2 template)
      const isEmptyHeading = note.content.length === 1 && 
                             note.content[0].type === "heading" && 
                             (note.content[0].props?.level === 1 || note.content[0].props?.level === 2) &&
                             (!note.content[0].content || note.content[0].content.length === 0);
      
      const isNewNote = !note.content || note.content.length === 0 || isEmptyParagraph || isEmptyHeading;
      const shouldFocus = isNewNote || new URLSearchParams(location.search).get('focus') === 'true';
      
      if (shouldFocus) {
        // Small delay to ensure editor is fully mounted
        setTimeout(() => {
          editorRef.current?.focusEditor();
          hasFocusedRef.current = true;
        }, 100);
      }
    }
  }, [editor, note, location.search, noteId]);

  if (error) {
    return (
        <EmptyState
          message="Failed to load note"
          submessage={error}
          icon={<AlertCircle className="h-8 w-8 text-destructive" />}
          actions={[
            {
              label: "Refresh page",
              onClick: () => window.location.reload(),
            },
          ]}
          isFull
        />
    );
  }

  if (!note) {
    return (
        <EmptyState
          message="Note not found"
          submessage="The note you're looking for doesn't exist or may have been deleted"
          isFull
        />
    );
  }

  return (
    <div className={`flex-1 bg-background overflow-hidden flex flex-col ${className}`}>
      <div className="flex-1">
        {isLoading ? (
            <EmptyState
              message="Loading editor..."
              submessage="Please wait while we prepare your editor"
            />
        ) : editor ? (
          <EditorWrapper ref={editorRef} editor={editor} />
        ) : (
            <EmptyState
              message="No editor available"
              submessage="Unable to initialize the editor"
              isFull
            />
        )}
      </div>
    </div>
  );
}