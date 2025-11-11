import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import { BlockNoteEditor } from "@blocknote/core";
import { useNotes } from "@/features/notes";
import { EditorWrapper } from "@/features/editor";
import { AppLayout } from "@/layout/AppLayout";

export default function NoteEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getNote, updateNote } = useNotes();
  const [noteName, setNoteName] = useState("");
  const [editor, setEditor] = useState<BlockNoteEditor | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const saveTimeoutRef = useRef<NodeJS.Timeout>();

  const note = id ? getNote(id) : null;

  // Initialize editor
  useEffect(() => {
    if (!note) {
      setIsLoading(false);
      return;
    }

    const newEditor = new BlockNoteEditor({
      initialContent: note.content || [
        {
          type: "paragraph",
          content: [],
        },
      ],
    });

    setEditor(newEditor);
    setNoteName(note.name);
    setIsLoading(false);
  }, [note?.id]);

  const handleSave = () => {
    if (!id || !editor) return;
    const blocks = editor.document;
    updateNote(id, blocks, noteName);
  };

  // Auto-save on editor change
  useEffect(() => {
    if (!editor || !id || isLoading) return;

    const handleChange = () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        handleSave();
      }, 1000);
    };

    editor.onEditorContentChange(handleChange);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [editor, id, noteName, isLoading]);

  if (!id || !note) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-Skriuw-dark">
        <div className="text-center">
          <p className="text-Skriuw-text-muted mb-4">Note not found</p>
          <button
            onClick={() => navigate("/")}
            className="px-4 py-2 bg-Skriuw-border text-Skriuw-text rounded-md hover:bg-Skriuw-border/80 transition-colors"
          >
            Back to Notes
          </button>
        </div>
      </div>
    );
  }

  return (
    <AppLayout sidebarActiveNoteId={id}>
      {/* BlockNote Editor */}
      <div className="flex-1 bg-Skriuw-dark overflow-hidden flex flex-col">
        <div className="px-4 sm:px-8 pt-4 pb-2 border-b border-Skriuw-border">
          <h1 className="text-2xl sm:text-3xl text-Skriuw-text font-normal">
            {noteName}
          </h1>
        </div>

        {!isLoading && editor ? (
          <EditorWrapper editor={editor} />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-Skriuw-text-muted">
              {isLoading ? "Loading editor..." : "No editor"}
            </p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
