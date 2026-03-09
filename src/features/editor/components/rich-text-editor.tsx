"use client";

import { useEffect, useMemo, useCallback, useRef } from "react";
import { BlockNoteEditor } from "@blocknote/core";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import type { RichTextDocument } from "@/types/notes";
import { cloneRichDocument, markdownToRichDocument } from "@/shared/lib/rich-document";

interface RichTextEditorProps {
  content: string;
  richContent?: RichTextDocument;
  onChange: (next: { markdown: string; richContent: RichTextDocument }) => void;
}

// Convert BlockNote blocks to markdown
async function blocksToMarkdown(editor: BlockNoteEditor): Promise<string> {
  try {
    const markdown = await editor.blocksToMarkdownLossy(editor.document);
    return markdown;
  } catch {
    return "";
  }
}

export function RichTextEditor({ content, richContent, onChange }: RichTextEditorProps) {
  const lastContentRef = useRef(content);
  const lastRichContentRef = useRef<string>(JSON.stringify(richContent ?? []));
  const pendingMarkdownRef = useRef(content);
  const isInternalChangeRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const serializeRunIdRef = useRef(0);

  const initialBlocks = useMemo(
    () => (richContent && richContent.length > 0 ? richContent : markdownToRichDocument(content)),
    [],
  );

  const editor = useCreateBlockNote({
    initialContent: initialBlocks,
  });

  // Handle content changes from editor
  const handleEditorChange = useCallback(async () => {
    if (!editor) return;

    const runId = ++serializeRunIdRef.current;
    const markdown = await blocksToMarkdown(editor);
    if (runId !== serializeRunIdRef.current) {
      return;
    }

    const nextRichContent = cloneRichDocument(editor.document);
    const nextRichContentKey = JSON.stringify(nextRichContent);
    pendingMarkdownRef.current = markdown;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      if (
        pendingMarkdownRef.current === lastContentRef.current &&
        nextRichContentKey === lastRichContentRef.current
      ) {
        return;
      }

      isInternalChangeRef.current = true;
      lastContentRef.current = pendingMarkdownRef.current;
      lastRichContentRef.current = nextRichContentKey;
      onChange({ markdown: pendingMarkdownRef.current, richContent: nextRichContent });

      window.setTimeout(() => {
        isInternalChangeRef.current = false;
      }, 80);
    }, 180);
  }, [editor, onChange]);

  // Sync external content changes to editor
  useEffect(() => {
    if (!editor || isInternalChangeRef.current) return;
    const nextRichContent =
      richContent && richContent.length > 0 ? richContent : markdownToRichDocument(content);
    const nextRichContentKey = JSON.stringify(nextRichContent);
    if (content !== lastContentRef.current || nextRichContentKey !== lastRichContentRef.current) {
      editor.replaceBlocks(editor.document, nextRichContent);
      lastContentRef.current = content;
      lastRichContentRef.current = nextRichContentKey;
      pendingMarkdownRef.current = content;
    }
  }, [content, editor, richContent]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="blocknote-wrapper h-full min-h-full">
      <BlockNoteView
        editor={editor}
        onChange={handleEditorChange}
        theme="dark"
        className="h-full"
      />
      <style jsx global>{`
        .blocknote-wrapper {
          --bn-colors-editor-background: #1e1e1e;
          --bn-colors-editor-text: hsl(220 10% 82%);
          --bn-colors-menu-background: hsl(220 16% 6%);
          --bn-colors-menu-text: hsl(220 10% 82%);
          --bn-colors-tooltip-background: hsl(220 16% 6%);
          --bn-colors-tooltip-text: hsl(220 10% 82%);
          --bn-colors-hovered-background: hsl(220 12% 14%);
          --bn-colors-selected-background: hsl(220 12% 16%);
          --bn-colors-disabled-background: hsl(220 10% 15%);
          --bn-colors-disabled-text: hsl(220 8% 40%);
          --bn-colors-border: hsl(220 10% 15%);
          --bn-colors-side-menu: hsl(220 8% 40%);
          --bn-font-family: "Inter", system-ui, -apple-system, sans-serif;
          height: 100%;
          min-height: 100%;
          background: #1e1e1e !important;
        }
        .blocknote-wrapper .bn-container,
        .blocknote-wrapper .bn-container [data-theming-css-variables-demo],
        .blocknote-wrapper [class*="bn-"] {
          background: transparent !important;
        }
        .blocknote-wrapper > div,
        .blocknote-wrapper .bn-container > div {
          height: 100%;
          min-height: 100%;
          background: #1e1e1e !important;
        }
        .blocknote-wrapper .bn-container {
          height: 100%;
          min-height: 100%;
        }
        .blocknote-wrapper .bn-editor {
          box-sizing: border-box;
          padding-left: 2rem;
          padding-right: 2rem;
          padding-top: 2rem;
          padding-bottom: 2rem;
          width: 100%;
          max-width: 42rem;
          margin: 0 auto;
          min-height: 100%;
          background: #1e1e1e !important;
        }
        .blocknote-wrapper .bn-block-content {
          font-size: 0.9375rem;
          line-height: 1.7;
        }
        .blocknote-wrapper [data-content-type="heading"] {
          margin-top: 1.5rem;
          margin-bottom: 0.75rem;
        }
        .blocknote-wrapper .bn-inline-content code {
          background: hsl(220 12% 14%);
          padding: 0.125rem 0.375rem;
          border-radius: 0.25rem;
          font-size: 0.875em;
        }
        .blocknote-wrapper pre,
        .blocknote-wrapper pre code,
        .blocknote-wrapper [data-content-type="codeBlock"],
        .blocknote-wrapper [data-content-type="codeBlock"] * {
          white-space: pre-wrap !important;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .blocknote-wrapper pre {
          max-width: 100%;
          overflow-x: hidden;
        }
        /* Override any mantine styles */
        .blocknote-wrapper .mantine-Paper-root,
        .blocknote-wrapper [class*="mantine-"] {
          --mantine-color-body: #1e1e1e;
        }
      `}</style>
    </div>
  );
}
