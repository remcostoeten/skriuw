"use client";

import { useEffect, useMemo, useCallback, useRef, useState } from "react";
import { BlockNoteEditor } from "@blocknote/core";
import {
  SuggestionMenuController,
  type DefaultReactSuggestionItem,
  type SuggestionMenuProps,
  useCreateBlockNote,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import { cn } from "@/shared/lib/utils";
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

function KeyboardAccessibleSlashMenu({
  items,
  loadingState,
  selectedIndex,
  onItemClick,
}: SuggestionMenuProps<DefaultReactSuggestionItem>) {
  const [activeIndex, setActiveIndex] = useState(selectedIndex ?? 0);

  useEffect(() => {
    setActiveIndex(selectedIndex ?? 0);
  }, [selectedIndex, items.length]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const suggestionMenu = document.getElementById("bn-suggestion-menu");
      if (!suggestionMenu || items.length === 0) {
        return;
      }

      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.closest(".blocknote-wrapper")) {
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        setActiveIndex((prev) => (prev + 1) % items.length);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        setActiveIndex((prev) => (prev - 1 + items.length) % items.length);
        return;
      }

      if (event.key === "PageDown") {
        event.preventDefault();
        event.stopPropagation();
        setActiveIndex(items.length - 1);
        return;
      }

      if (event.key === "PageUp") {
        event.preventDefault();
        event.stopPropagation();
        setActiveIndex(0);
        return;
      }

      if (event.key === "Enter" || event.key === "Tab") {
        const item = items[activeIndex];
        if (!item) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        onItemClick?.(item);
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [activeIndex, items, onItemClick]);

  useEffect(() => {
    const activeItem = document.getElementById(`bn-suggestion-menu-item-${activeIndex}`);
    activeItem?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (loadingState === "loading-initial" || loadingState === "loading") {
    return null;
  }

  return (
    <div
      id="bn-suggestion-menu"
      role="listbox"
      className="bn-suggestion-menu z-[100] max-h-[min(24rem,50vh)] overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-xl"
    >
      {items.map((item, index) => (
        <button
          key={`${item.title}-${index}`}
          id={`bn-suggestion-menu-item-${index}`}
          type="button"
          role="option"
          aria-selected={index === activeIndex}
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => setActiveIndex(index)}
          onClick={() => onItemClick?.(item)}
          className={cn(
            "flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition-colors",
            index === activeIndex
              ? "bg-accent text-accent-foreground"
              : "text-foreground hover:bg-accent hover:text-accent-foreground",
          )}
        >
          {item.icon ? <span className="mt-0.5 shrink-0 text-muted-foreground">{item.icon}</span> : null}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{item.title}</span>
            {item.subtext ? (
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.subtext}</span>
            ) : null}
          </span>
          {item.badge ? (
            <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {item.badge}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
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
    <div className="blocknote-wrapper h-full min-h-full px-6 py-3">
      <BlockNoteView
        editor={editor}
        onChange={handleEditorChange}
        theme="dark"
        className="h-full"
        slashMenu={false}
      >
        <SuggestionMenuController
          triggerCharacter="/"
          suggestionMenuComponent={KeyboardAccessibleSlashMenu}
        />
      </BlockNoteView>
      <style jsx global>{`
        .blocknote-wrapper {
          --bn-colors-editor-background: hsl(var(--card));
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
          background: hsl(var(--card));
        }
        .blocknote-wrapper .bn-container,
        .blocknote-wrapper .bn-container [data-theming-css-variables-demo],
        .blocknote-wrapper .bn-scroller,
        .blocknote-wrapper .bn-editor-container {
          background: transparent !important;
        }
        .blocknote-wrapper .bn-editor {
          box-sizing: border-box;
          padding-left: 0;
          padding-right: 0;
          padding-top: 0;
          padding-bottom: 0;
          width: 100%;
          max-width: 42rem;
          margin: 0 auto;
          min-height: 100%;
          background: hsl(var(--card)) !important;
        }
        .blocknote-wrapper .bn-block-content {
          font-size: 0.9375rem;
          line-height: 1.7;
        }
        .blocknote-wrapper [data-content-type="heading"] {
          margin-top: 0.5rem;
          margin-bottom: 0.35rem;
        }
        .blocknote-wrapper .bn-block-group:first-child [data-content-type="heading"],
        .blocknote-wrapper .bn-block-group:first-child .bn-block-content[data-content-type="heading"] {
          margin-top: 0;
        }
        .blocknote-wrapper .bn-inline-content code {
          background: hsl(220 12% 14%);
          padding: 0.125rem 0.375rem;
          border-radius: 0.25rem;
          font-size: 0.875em;
        }
        .blocknote-wrapper .bn-toolbar {
          min-height: 2rem;
          background: hsl(220 18% 8%) !important;
          border: 1px solid hsl(220 10% 18%) !important;
          box-shadow:
            0 10px 30px rgba(0, 0, 0, 0.35),
            0 0 0 1px rgba(255, 255, 255, 0.03) inset;
          padding: 1px;
          gap: 1px;
          border-radius: 0.5rem;
        }
        .blocknote-wrapper .bn-toolbar .mantine-Button-root,
        .blocknote-wrapper .bn-toolbar .mantine-ActionIcon-root {
          min-height: 1.75rem;
          height: 1.75rem;
          background: transparent !important;
          color: hsl(220 10% 82%) !important;
          border-radius: 0.4rem;
        }
        .blocknote-wrapper .bn-toolbar .mantine-Button-root {
          padding-left: 0.45rem;
          padding-right: 0.45rem;
          font-size: 0.6875rem;
        }
        .blocknote-wrapper .bn-toolbar .mantine-Button-section {
          margin-inline: 0.2rem;
        }
        .blocknote-wrapper .bn-toolbar .mantine-ActionIcon-root {
          width: 1.75rem;
          min-width: 1.75rem;
        }
        .blocknote-wrapper .bn-toolbar .mantine-Button-root:hover,
        .blocknote-wrapper .bn-toolbar .mantine-ActionIcon-root:hover,
        .blocknote-wrapper .bn-toolbar .mantine-UnstyledButton-root:hover {
          background: hsl(220 12% 15%) !important;
          color: hsl(220 14% 94%) !important;
        }
        .blocknote-wrapper .bn-toolbar .mantine-Button-root[data-active="true"],
        .blocknote-wrapper .bn-toolbar .mantine-ActionIcon-root[data-active="true"],
        .blocknote-wrapper .bn-toolbar .mantine-UnstyledButton-root[data-active="true"] {
          background: hsl(220 14% 18%) !important;
          color: hsl(220 14% 96%) !important;
        }
        .blocknote-wrapper .bn-toolbar svg {
          width: 0.82rem;
          height: 0.82rem;
        }
        .blocknote-wrapper .bn-toolbar .mantine-Menu-item {
          min-height: 1.75rem;
          height: 1.75rem;
          font-size: 0.75rem;
        }
        .blocknote-wrapper .bn-toolbar .mantine-Menu-dropdown,
        .blocknote-wrapper .bn-toolbar .mantine-Popover-dropdown,
        .blocknote-wrapper .bn-toolbar .mantine-Tooltip-tooltip {
          background: hsl(220 18% 8%) !important;
          border: 1px solid hsl(220 10% 18%) !important;
          color: hsl(220 10% 82%) !important;
          box-shadow:
            0 16px 36px rgba(0, 0, 0, 0.42),
            0 0 0 1px rgba(255, 255, 255, 0.03) inset !important;
          backdrop-filter: none !important;
        }
        .blocknote-wrapper .bn-toolbar .mantine-Menu-item:hover,
        .blocknote-wrapper .bn-toolbar .mantine-Menu-item[data-hovered],
        .blocknote-wrapper .bn-toolbar .mantine-Menu-item[data-selected] {
          background: hsl(220 12% 15%) !important;
          color: hsl(220 14% 94%) !important;
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
          --mantine-color-body: hsl(var(--background));
        }
      `}</style>
    </div>
  );
}
