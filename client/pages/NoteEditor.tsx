import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import { BlockNoteEditor } from "@blocknote/core";
import { useNotes } from "@/hooks/useNotes";
import EditorWrapper from "@/components/EditorWrapper";
import Sidebar from "@/components/Sidebar";
import LeftToolbar from "@/components/LeftToolbar";
import TopToolbar from "@/components/TopToolbar";
import Footer from "@/components/Footer";

export default function NoteEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getNote, updateNote } = useNotes();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
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
      <div className="h-screen w-screen flex items-center justify-center bg-haptic-dark">
        <div className="text-center">
          <p className="text-haptic-text-muted mb-4">Note not found</p>
          <button
            onClick={() => navigate("/")}
            className="px-4 py-2 bg-haptic-border text-haptic-text rounded-md hover:bg-haptic-border/80 transition-colors"
          >
            Back to Notes
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-haptic-dark overflow-hidden">
      <div className="flex flex-1 overflow-hidden relative">
        {/* Mobile overlay */}
        {isSidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-20 lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Left Toolbar - hidden on mobile */}
        <div className="hidden lg:block">
          <LeftToolbar />
        </div>

        {/* Sidebar */}
        <div
          className={`
          fixed lg:static inset-y-0 left-0 z-30 lg:z-0
          transform transition-transform duration-200 ease-in-out
          ${isSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
        >
          <Sidebar activeNoteId={id} />
        </div>

        {/* Main content area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <TopToolbar onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} />

          {/* BlockNote Editor */}
          <div className="flex-1 bg-haptic-dark overflow-hidden flex flex-col">
            <div className="px-4 sm:px-8 pt-4 pb-2 border-b border-haptic-border">
              <h1 className="text-2xl sm:text-3xl text-haptic-text font-normal">
                {noteName}
              </h1>
            </div>

            {!isLoading && editor ? (
              <EditorWrapper editor={editor} />
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-haptic-text-muted">
                  {isLoading ? "Loading editor..." : "No editor"}
                </p>
              </div>
            )}
          </div>

          <Footer />
        </div>
      </div>
    </div>
  );
}
