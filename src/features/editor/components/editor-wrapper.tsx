import { BlockNoteEditor } from "@blocknote/core";
import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import "@blocknote/core/style.css";
import { useUserPreferences } from "@/features/settings";

type props = {
  editor: BlockNoteEditor | null;
}

export type EditorWrapperHandle = {
  focusEditor: () => void;
}

export const EditorWrapper = forwardRef<EditorWrapperHandle, props>(
  ({ editor }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const { hasWordWrap } = useUserPreferences();

    useImperativeHandle(ref, () => ({
      focusEditor: () => editor?.domElement?.focus(),
    }))

    useEffect(() => {
      if (!editor || !containerRef.current) return;

      containerRef.current.innerHTML = "";
      editor.mount(containerRef.current);

      return () => {
        if (containerRef.current) {
          containerRef.current.innerHTML = "";
        }
      };
    }, [editor]);

    // Apply word wrap styles when editor or setting changes
    useEffect(() => {
      if (!editor) return;

      const editorElement = editor.domElement;
      if (!editorElement) return;

      // Apply styles to the main editor element
      if (hasWordWrap) {
        editorElement.style.whiteSpace = 'pre-wrap';
        editorElement.style.overflowWrap = 'break-word';
        editorElement.style.wordBreak = 'break-word';
        editorElement.style.overflowX = 'hidden';
      } else {
        editorElement.style.whiteSpace = 'pre';
        editorElement.style.overflowWrap = 'normal';
        editorElement.style.wordBreak = 'normal';
        editorElement.style.overflowX = 'auto';
      }

      // Also apply to contenteditable elements within the editor
      const contentEditableElements = editorElement.querySelectorAll('[contenteditable="true"]');
      contentEditableElements.forEach((el) => {
        const htmlEl = el as HTMLElement;
        if (hasWordWrap) {
          htmlEl.style.whiteSpace = 'pre-wrap';
          htmlEl.style.overflowWrap = 'break-word';
          htmlEl.style.wordBreak = 'break-word';
        } else {
          htmlEl.style.whiteSpace = 'pre';
          htmlEl.style.overflowWrap = 'normal';
          htmlEl.style.wordBreak = 'normal';
        }
      });
    }, [editor, hasWordWrap]);

    return (
      <div
        ref={containerRef}
        className="editor-container w-full h-full overflow-y-auto"
        style={{
          background: "transparent",
        }}
      >
        <style>{`
        .editor-container {
          background: transparent !important;
        }
        .editor-container .bn-editor {
          background: transparent !important;
          padding: 1.5rem;
          max-width: 100%;
          color: rgba(230, 230, 230, 0.9);
          font-family: 'Ubuntu Sans', -apple-system, system-ui, sans-serif;
        }
        .editor-container .bn-editor:focus {
          outline: none;
        }
        .editor-container .bn-editor:focus-visible {
          outline: none;
        }
        .editor-container .bn-block {
          color: rgba(230, 230, 230, 0.9);
        }
        .editor-container .bn-inline-content {
          color: rgba(230, 230, 230, 0.9);
        }
        .editor-container strong {
          color: rgba(230, 230, 230, 1);
        }
        .editor-container em {
          color: rgba(230, 230, 230, 0.9);
          font-style: italic;
        }
        .editor-container code {
          background: rgba(46, 46, 46, 0.5);
          color: rgba(230, 230, 230, 1);
          padding: 0.2rem 0.4rem;
          border-radius: 3px;
          font-family: monospace;
        }
        .editor-container a {
          color: rgba(249, 250, 251, 1);
          text-decoration: underline;
        }
        .editor-container a:hover {
          text-decoration: none;
        }
        .editor-container [data-placeholder] {
          color: rgba(140, 140, 140, 0.6);
        }
        .editor-container [contenteditable]:focus {
          outline: none;
        }
        .editor-container .bn-toolbar {
          background: rgba(18, 18, 18, 0.95) !important;
          border-color: rgba(46, 46, 46, 0.5) !important;
        }
        .editor-container .bn-toolbar button {
          color: rgba(230, 230, 230, 0.7);
        }
        .editor-container .bn-toolbar button:hover {
          background: rgba(46, 46, 46, 0.5) !important;
          color: rgba(230, 230, 230, 1);
        }
      `}</style>
      </div>
    );
  });

EditorWrapper.displayName = 'EditorWrapper';