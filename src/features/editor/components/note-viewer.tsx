import { BlockNoteEditor, Block } from "@blocknote/core";
import { AlertCircle } from "lucide-react";

import { EmptyState } from "@/shared/ui/empty-state";

import { useEditor } from "../hooks/use-editor";

import { EditorWrapper } from "./editor-wrapper";

type props = {
  noteId: string;
  className?: string;
  styling?: "minimal" | "document" | "presentation";
  maxWidth?: string;
}

export function NoteViewer({
  noteId,
  className = "",
  styling = "document",
  maxWidth = "719px",
    }: props) {
  const {
    note,
    noteName,
    isLoading,
    error,
  } = useEditor({
    noteId,
    readOnly: true,
    autoSave: false,
  });

  const defaultContent: Block[] = [
    {
      id: "1",
      type: "paragraph",
      props: {},
      content: [],
      children: [],
    } as Block,
  ];

  const viewer = note ? BlockNoteEditor.create({
    initialContent: note.content && note.content.length > 0 
      ? note.content 
      : defaultContent as Block[],
    editable: false,
  }) : null;

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
      <div className="flex-1 flex items-center justify-center">
        <EmptyState
          message="Note not found"
          submessage="The note you're looking for doesn't exist or may have been deleted"
          isFull
        />
      </div>
    );
  }

  const getStylingClasses = () => {
    switch (styling) {
      case "minimal":
        return "index-editor-wrapper";
      case "presentation":
        return "presentation-viewer-wrapper";
      case "document":
      default:
        return "document-viewer-wrapper";
    }
  };

  const getStylingCSS = () => {
    switch (styling) {
      case "minimal":
        return `
          .index-editor-wrapper .editor-container {
            min-height: auto;
          }
          .index-editor-wrapper .editor-container .bn-editor {
            padding: 0;
          }
          .index-editor-wrapper .editor-container .bn-block {
            margin-bottom: 0;
          }
          .index-editor-wrapper .editor-container .bn-block:first-child[data-content-type="heading"] {
            display: none;
          }
          .index-editor-wrapper .editor-container .bn-block[data-content-type="paragraph"] {
            margin-bottom: 1.5rem;
            font-size: 0.875rem;
            line-height: 1.25rem;
            color: rgba(140, 140, 140, 0.9);
          }
          @media (min-width: 640px) {
            .index-editor-wrapper .editor-container .bn-block[data-content-type="paragraph"] {
              font-size: 1rem;
            }
          }
          .index-editor-wrapper .editor-container .bn-block[data-content-type="heading"] {
            font-size: 1.25rem;
            line-height: 1.75rem;
            font-weight: 400;
            margin-bottom: 1.5rem;
            color: rgba(230, 230, 230, 0.9);
          }
          @media (min-width: 640px) {
            .index-editor-wrapper .editor-container .bn-block[data-content-type="heading"] {
              font-size: 1.5rem;
              line-height: 2rem;
            }
          }
          .index-editor-wrapper .editor-container .bn-block[data-content-type="heading"][data-level="1"] {
            font-size: 1.875rem;
            line-height: 2.25rem;
          }
          @media (min-width: 640px) {
            .index-editor-wrapper .editor-container .bn-block[data-content-type="heading"][data-level="1"] {
              font-size: 2.25rem;
              line-height: 2.5rem;
            }
          }
          .index-editor-wrapper .editor-container .bn-block[data-content-type="heading"][data-level="2"] {
            font-size: 1.25rem;
            line-height: 1.75rem;
            margin-bottom: 1.5rem;
          }
          @media (min-width: 640px) {
            .index-editor-wrapper .editor-container .bn-block[data-content-type="heading"][data-level="2"] {
              font-size: 1.5rem;
              line-height: 2rem;
              margin-bottom: 2rem;
            }
          }
          .index-editor-wrapper .editor-container .bn-block[data-content-type="bulletListItem"] {
            margin-bottom: 0.25rem;
            font-size: 0.875rem;
            line-height: 1.75rem;
            color: rgba(140, 140, 140, 0.9);
          }
          @media (min-width: 640px) {
            .index-editor-wrapper .editor-container .bn-block[data-content-type="bulletListItem"] {
              font-size: 1rem;
              line-height: 1.75rem;
            }
          }
          .index-editor-wrapper .editor-container ul {
            padding-left: 1rem;
            margin-bottom: 2rem;
          }
          @media (min-width: 640px) {
            .index-editor-wrapper .editor-container ul {
              padding-left: 1.5rem;
              margin-bottom: 3rem;
            }
          }
        `;
      case "presentation":
        return `
          .presentation-viewer-wrapper .editor-container .bn-editor {
            padding: 3rem;
            max-width: ${maxWidth};
            margin: 0 auto;
          }
          .presentation-viewer-wrapper .editor-container .bn-block[data-content-type="heading"][data-level="1"] {
            font-size: 3rem;
            line-height: 1.2;
            margin-bottom: 2rem;
            text-align: center;
          }
          .presentation-viewer-wrapper .editor-container .bn-block[data-content-type="paragraph"] {
            font-size: 1.25rem;
            line-height: 1.75;
            margin-bottom: 1.5rem;
          }
        `;
      case "document":
      default:
        return `
          .document-viewer-wrapper .editor-container .bn-editor {
            padding: 2rem;
            max-width: ${maxWidth};
            margin: 0 auto;
          }
          .document-viewer-wrapper .editor-container .bn-block[data-content-type="heading"][data-level="1"] {
            font-size: 2.25rem;
            line-height: 2.5rem;
            margin-bottom: 1.5rem;
            font-weight: 600;
          }
          .document-viewer-wrapper .editor-container .bn-block[data-content-type="paragraph"] {
            font-size: 1rem;
            line-height: 1.75;
            margin-bottom: 1rem;
          }
        `;
    }
  };

  return (
    <div className={`flex-1 bg-background overflow-y-auto ${className}`}>
      <div style={{ maxWidth }} className="mx-auto px-4 sm:px-8 pt-6 sm:pt-10 pb-10">
        <div className="flex flex-col gap-1">
          <div className="px-4 sm:px-8 py-2.5 flex justify-center">
            <h1 className="text-3xl sm:text-4xl text-foreground font-normal leading-tight sm:leading-10">
              {noteName || "Untitled Note"}
            </h1>
          </div>

          <div className="max-w-[587px] mx-auto w-full">
            {isLoading ? (
              <div className="flex-1 flex items-center justify-center py-20">
                <EmptyState
                  message="Loading note..."
                  submessage="Please wait while we load the content"
                />
              </div>
            ) : viewer ? (
              <div className={getStylingClasses()}>
                <EditorWrapper editor={viewer} />
                <style>{getStylingCSS()}</style>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center py-20">
                <EmptyState
                  message="No content available"
                  submessage="This note appears to be empty"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}