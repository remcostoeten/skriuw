import { EditorWrapper, EditorWrapperHandle } from "./editor-wrapper";
import { editorLogic } from "../hooks/use-editor";
import { useShortcut } from "@/shared/shortcuts/use-shortcut";
import { useRef } from "react";

type props = {
  noteId: string;
  className?: string;
  autoSave?: boolean;
  autoSaveDelay?: number;
}

export function NoteEditor({
  noteId,
  className = "",
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
  useShortcut('editor-focus', (event: KeyboardEvent) => {
    event.preventDefault();
    editorRef.current?.focusEditor();
  });

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-2">Error: {error}</p>
          <p className="text-Skriuw-text-muted">Please try refreshing the page</p>
        </div>
      </div>
    );
  }

  if (!note) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-Skriuw-text-muted">Note not found</p>
      </div>
    );
  }

  return (
    <div className={`flex-1 bg-Skriuw-dark overflow-hidden flex flex-col ${className}`}>
      <div className="flex-1">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-Skriuw-text-muted">Loading editor...</p>
          </div>
        ) : editor ? (
          <EditorWrapper ref={editorRef} editor={editor} />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-Skriuw-text-muted">No editor available</p>
          </div>
        )}
      </div>
    </div>
  );
}