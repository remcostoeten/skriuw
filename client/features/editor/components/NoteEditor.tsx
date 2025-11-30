import { EditorWrapper, EditorWrapperHandle } from "./editor-wrapper";
import { editorLogic } from "../hooks/use-editor";
import { useShortcut } from "@/features/shortcuts/use-shortcut";
import { useRef, useEffect } from "react";
import { EmptyState } from "@/shared/ui/empty-state";
import { AlertCircle } from "lucide-react";
import { useLocation } from "react-router-dom";

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
  } = editorLogic({
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

  // Focus editor when note is newly created (empty content) or when navigating with ?focus=true
  useEffect(() => {
    if (editor && note && !hasFocusedRef.current) {
      const isNewNote = !note.content || note.content.length === 0 || 
                       (note.content.length === 1 && note.content[0].type === "paragraph" && 
                        (!note.content[0].content || note.content[0].content.length === 0));
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
      <div className="flex-1 flex items-center justify-center">
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
        />
      </div>
    );
  }

  if (!note) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <EmptyState
          message="Note not found"
          submessage="The note you're looking for doesn't exist or may have been deleted"
        />
      </div>
    );
  }

  return (
    <div className={`flex-1 bg-background overflow-hidden flex flex-col ${className}`}>
      <div className="flex-1">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState
              message="Loading editor..."
              submessage="Please wait while we prepare your editor"
            />
          </div>
        ) : editor ? (
          <EditorWrapper ref={editorRef} editor={editor} />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState
              message="No editor available"
              submessage="Unable to initialize the editor"
            />
          </div>
        )}
      </div>
    </div>
  );
}