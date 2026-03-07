"use client";

import { useEffect, useMemo, useCallback, useRef } from "react";
import { BlockNoteEditor, PartialBlock } from "@blocknote/core";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";

interface RichTextEditorProps {
  content: string;
  onChange: (markdown: string) => void;
}

// Convert markdown to BlockNote blocks
function markdownToBlocks(markdown: string): PartialBlock[] {
  const lines = markdown.split("\n");
  const blocks: PartialBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3;
      blocks.push({
        type: "heading",
        props: { level: Math.min(level, 3) as 1 | 2 | 3 },
        content: headingMatch[2],
      });
      i++;
      continue;
    }

    // Bullet list item
    if (line.match(/^[-*]\s+/)) {
      const listItems: PartialBlock[] = [];
      while (i < lines.length && lines[i].match(/^[-*]\s+/)) {
        const itemContent = lines[i].replace(/^[-*]\s+/, "");
        listItems.push({
          type: "bulletListItem",
          content: itemContent,
        });
        i++;
      }
      blocks.push(...listItems);
      continue;
    }

    // Numbered list item
    if (line.match(/^\d+\.\s+/)) {
      const listItems: PartialBlock[] = [];
      while (i < lines.length && lines[i].match(/^\d+\.\s+/)) {
        const itemContent = lines[i].replace(/^\d+\.\s+/, "");
        listItems.push({
          type: "numberedListItem",
          content: itemContent,
        });
        i++;
      }
      blocks.push(...listItems);
      continue;
    }

    // Code block
    if (line.startsWith("```")) {
      const language = line.slice(3).trim();
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      blocks.push({
        type: "codeBlock",
        props: { language: language || "plaintext" },
        content: codeLines.join("\n"),
      });
      i++; // Skip closing ```
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      blocks.push({
        type: "paragraph",
        content: line.slice(2),
      });
      i++;
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Regular paragraph
    blocks.push({
      type: "paragraph",
      content: line,
    });
    i++;
  }

  return blocks.length > 0 ? blocks : [{ type: "paragraph", content: "" }];
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

export function RichTextEditor({ content, onChange }: RichTextEditorProps) {
  const lastContentRef = useRef(content);
  const isInternalChangeRef = useRef(false);

  const initialBlocks = useMemo(() => markdownToBlocks(content), []);

  const editor = useCreateBlockNote({
    initialContent: initialBlocks,
  });

  // Handle content changes from editor
  const handleEditorChange = useCallback(async () => {
    if (!editor) return;
    isInternalChangeRef.current = true;
    const markdown = await blocksToMarkdown(editor);
    lastContentRef.current = markdown;
    onChange(markdown);
    setTimeout(() => {
      isInternalChangeRef.current = false;
    }, 100);
  }, [editor, onChange]);

  // Sync external content changes to editor
  useEffect(() => {
    if (!editor || isInternalChangeRef.current) return;
    if (content !== lastContentRef.current) {
      const blocks = markdownToBlocks(content);
      editor.replaceBlocks(editor.document, blocks);
      lastContentRef.current = content;
    }
  }, [content, editor]);

  return (
    <div className="blocknote-wrapper h-full">
      <BlockNoteView
        editor={editor}
        onChange={handleEditorChange}
        theme="dark"
        className="h-full"
      />
      <style jsx global>{`
        .blocknote-wrapper {
          --bn-colors-editor-background: hsl(220 14% 8%);
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
          background: hsl(220 14% 8%) !important;
        }
        .blocknote-wrapper .bn-container,
        .blocknote-wrapper .bn-container [data-theming-css-variables-demo],
        .blocknote-wrapper [class*="bn-"] {
          background: transparent !important;
        }
        .blocknote-wrapper > div,
        .blocknote-wrapper .bn-container > div {
          background: hsl(220 14% 8%) !important;
        }
        .blocknote-wrapper .bn-container {
          height: 100%;
        }
        .blocknote-wrapper .bn-editor {
          padding-left: 2rem;
          padding-right: 2rem;
          padding-top: 2rem;
          padding-bottom: 2rem;
          max-width: 42rem;
          margin: 0 auto;
          min-height: 100%;
          background: hsl(220 14% 8%) !important;
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
        /* Override any mantine styles */
        .blocknote-wrapper .mantine-Paper-root,
        .blocknote-wrapper [class*="mantine-"] {
          --mantine-color-body: hsl(220 14% 8%);
        }
      `}</style>
    </div>
  );
}
